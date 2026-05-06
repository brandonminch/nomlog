import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import posthog from '../config/posthog';
import { PrimaryGoal, UserProfile, UserProfileUpdateSchema } from '../types/userProfile';
import { PhysicalStatsService } from '../services/physicalStatsService';
import { calculateTargets } from '../services/targetCalculationService';
import { getUserLlmQuotaConfig } from '../ai/llmQuotaConfig';
import {
  approximateIsoDateFromAgeYears,
  getAgeYearsFromDateOfBirth,
} from '../utils/ageFromDateOfBirth';
import { replyIfLlmQuotaExceeded } from '../ai/openaiResponses';

const router = Router();
const physicalStatsService = new PhysicalStatsService();

function profileWithDerivedAge(p: UserProfile): UserProfile {
  if (!p.date_of_birth || !/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)) {
    return p;
  }
  const tz = p.timezone && p.timezone.length > 0 ? p.timezone : 'UTC';
  try {
    const ay = getAgeYearsFromDateOfBirth(p.date_of_birth, new Date(), tz);
    return { ...p, age_years: ay };
  } catch {
    return p;
  }
}

function ageYearsForTargetsFromEffective(effective: Partial<UserProfile>): number | null {
  const dob = effective.date_of_birth;
  if (dob == null || typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return null;
  }
  const tz = typeof effective.timezone === 'string' && effective.timezone ? effective.timezone : 'UTC';
  try {
    return getAgeYearsFromDateOfBirth(dob, new Date(), tz);
  } catch {
    return null;
  }
}

// Get all users
router.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Get all users' });
});

// Get current user's profile (MUST be before /:id route)
router.get('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user!.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      throw error;
    }

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json({ profile: profileWithDerivedAge(profile as UserProfile) });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// OpenAI Responses usage in the current quota window (rolling)
router.get('/profile/llm-usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const cfg = await getUserLlmQuotaConfig(req.user!.id);
    const since = new Date(Date.now() - cfg.windowSeconds * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('sum_llm_tokens_since', {
      p_user_id: req.user!.id,
      p_since: since,
    });
    if (error) throw error;
    const used = Number(data ?? 0);
    const limit = cfg.enabled ? cfg.limitTokens : null;
    res.json({
      windowSeconds: cfg.windowSeconds,
      limitTokens: limit,
      usedTokens: used,
      remainingTokens: limit != null ? Math.max(0, limit - used) : null,
      quotaEnabled: cfg.enabled,
      membershipTier: cfg.membershipTier,
    });
  } catch (error) {
    console.error('Error fetching llm usage:', error);
    res.status(500).json({
      error: 'Failed to fetch LLM usage',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update current user's profile (MUST be before /:id route)
router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validationResult = UserProfileUpdateSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: validationResult.error.errors
      });
      return;
    }

    const updates = validationResult.data as any;

    // Normalize conversational physical stats if provided
    const {
      age_input,
      height_input,
      weight_input,
      recalculate_nutrition_targets: recalculateNutritionTargets,
      ...rest
    } = updates;

    const dbUpdates: Record<string, unknown> = { ...rest };

    try {
      if (typeof age_input === 'string' && age_input.trim()) {
        const explicitDob =
          updates.date_of_birth != null && String(updates.date_of_birth).length > 0;
        if (!explicitDob) {
          const ageYears = await physicalStatsService.parseAge(age_input, {
            userId: req.user!.id,
            route: 'users/profile/patch',
          });
          dbUpdates.date_of_birth = approximateIsoDateFromAgeYears(ageYears);
        }
      }

      if (typeof height_input === 'string' && height_input.trim()) {
        const { heightCm, preferredUnit } = await physicalStatsService.parseHeight(height_input, {
          userId: req.user!.id,
          route: 'users/profile/patch',
        });
        dbUpdates.height_cm = heightCm;
        dbUpdates.preferred_height_unit = preferredUnit;
      }

      if (typeof weight_input === 'string' && weight_input.trim()) {
        const { weightKg, preferredUnit } = await physicalStatsService.parseWeight(weight_input, {
          userId: req.user!.id,
          route: 'users/profile/patch',
        });
        dbUpdates.weight_kg = weightKg;
        dbUpdates.preferred_weight_unit = preferredUnit;
      }
    } catch (error) {
      console.error('Error parsing physical stats:', error);
      res.status(400).json({
        error: 'Invalid physical stats',
        message: error instanceof Error ? error.message : 'Could not understand the values you entered.',
      });
      return;
    }

    // Check if profile exists, if not create it
    const { data: existingProfile, error: fetchError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user!.id)
      .single();

    const priorProfile: UserProfile | null =
      fetchError?.code === 'PGRST116' ? null : (existingProfile as UserProfile | null);

    let profile: UserProfile | null = (existingProfile as UserProfile | null) ?? null;
    if (fetchError && fetchError.code === 'PGRST116') {
      // Profile doesn't exist, create it with defaults and updates
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          user_id: req.user!.id,
          ...dbUpdates
        })
        .select()
        .single();

      if (createError) throw createError;
      profile = newProfile;
    } else {
      if (fetchError) throw fetchError;

      // If profile exists, we may want to compute targets combining previous + new values.
      profile = existingProfile as UserProfile;

      // Profile exists, update it
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update(dbUpdates)
        .eq('user_id', req.user!.id)
        .select()
        .single();

      if (updateError) throw updateError;
      profile = updatedProfile;
    }

    // After insert/update, compute targets if we have enough data.
    try {
      const effective: Partial<UserProfile> = {
        ...(profile || {}),
        ...dbUpdates,
      } as any;

      const ageYearsForTargets = ageYearsForTargetsFromEffective(effective);
      const hasAllInputs =
        ageYearsForTargets != null &&
        ageYearsForTargets >= 1 &&
        effective.height_cm != null &&
        effective.weight_kg != null &&
        typeof effective.biological_sex === 'string' &&
        typeof effective.activity_level === 'string' &&
        typeof effective.primary_goal === 'string';

      const shouldRecalculateTargets =
        hasAllInputs &&
        (recalculateNutritionTargets === true || priorProfile?.daily_calorie_goal == null);

      if (shouldRecalculateTargets) {
        const targets = calculateTargets({
          weightKg: Number(effective.weight_kg),
          heightCm: Number(effective.height_cm),
          ageYears: ageYearsForTargets,
          biologicalSex: effective.biological_sex as 'male' | 'female' | 'prefer_not_to_say',
          activityLevel: effective.activity_level as
            | 'sedentary'
            | 'lightly_active'
            | 'moderately_active'
            | 'very_active'
            | 'extremely_active',
          primaryGoal: effective.primary_goal as PrimaryGoal,
        });

        const { data: finalProfile, error: finalError } = await supabaseAdmin
          .from('user_profiles')
          .update({
            tdee_kcal: targets.tdee,
            // Use existing daily_*_goal fields as the canonical targets
            daily_calorie_goal: targets.targetCalories,
            daily_protein_goal: targets.proteinG,
            daily_carb_goal: targets.carbG,
            daily_fat_goal: targets.fatG,
          })
          .eq('user_id', req.user!.id)
          .select()
          .single();

        if (finalError) {
          console.error('Error updating nutrition targets:', finalError);
          posthog.capture({
            distinctId: req.user!.id,
            event: 'user profile updated',
            properties: { fields_updated: Object.keys(dbUpdates), targets_recalculated: false },
          });
          res.status(200).json({ profile: profileWithDerivedAge(profile as UserProfile) });
          return;
        }

        posthog.capture({
          distinctId: req.user!.id,
          event: 'user profile updated',
          properties: { fields_updated: Object.keys(dbUpdates), targets_recalculated: true },
        });
        res.json({ profile: profileWithDerivedAge(finalProfile as UserProfile) });
        return;
      }
    } catch (error) {
      console.error('Error calculating targets:', error);
      // Do not fail the main update; just return the basic profile.
      posthog.capture({
        distinctId: req.user!.id,
        event: 'user profile updated',
        properties: { fields_updated: Object.keys(dbUpdates), targets_recalculated: false },
      });
      res.status(200).json({ profile: profileWithDerivedAge(profile as UserProfile) });
      return;
    }

    posthog.capture({
      distinctId: req.user!.id,
      event: 'user profile updated',
      properties: { fields_updated: Object.keys(dbUpdates), targets_recalculated: false },
    });
    res.json({ profile: profileWithDerivedAge(profile as UserProfile) });
  } catch (error) {
    console.error('Error updating user profile:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get user by ID (MUST be last, after all specific routes like /profile)
router.get('/:id', (req: Request, res: Response) => {
  res.json({ message: `Get user with ID: ${req.params.id}` });
});

export default router;