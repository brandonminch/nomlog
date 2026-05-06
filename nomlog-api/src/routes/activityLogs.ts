import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import posthog from '../config/posthog';
import {
  activityExerciseSegmentSchema,
  createActivityLogBodySchema,
  patchActivityLogBodySchema,
  type ActivityExerciseSegment,
  validateManualExerciseSegments,
} from '../types/activityLog';
import type { ActivitySummary } from '../types/activitySummary';
import { ActivityChatIntentClassifier } from '../services/activityChatIntentClassifier';
import { ActivityAiService, type UserProfileForBurn } from '../services/activityAiService';
import { LlmQuotaExceededError, replyIfLlmQuotaExceeded } from '../ai/openaiResponses';
import { z } from 'zod';

const router = Router();
const activityChatIntentClassifier = new ActivityChatIntentClassifier();
const activityAiService = new ActivityAiService();

const activitySummaryRequestSchema = z.object({
  activityDescription: z.string().min(1),
  conversationHistory: z.array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

const createActivityLogFromChatBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  exercises: z.array(activityExerciseSegmentSchema),
  loggedAt: z.string().datetime({ offset: true }),
});

function validateManualExercisesForResponse(exercises: ActivityExerciseSegment[]): string[] {
  return validateManualExerciseSegments(exercises ?? []);
}

function buildActivityChatGuardrailSummary(message: string): ActivitySummary {
  return {
    name: '__ACTIVITY_CHAT_GUARDRAIL__',
    description: message,
    questionSummary: '',
    items: [],
    questions: [],
    assumptions: [],
  };
}

async function fetchUserProfileForBurn(userId: string): Promise<UserProfileForBurn> {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('weight_kg, height_cm, biological_sex')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[fetchUserProfileForBurn]', error.message);
  }

  return {
    weightKg: data?.weight_kg != null ? Number(data.weight_kg) : null,
    heightCm: data?.height_cm != null ? Number(data.height_cm) : null,
    biologicalSex: data?.biological_sex != null ? String(data.biological_sex) : null,
  };
}

function applyBurnToExercises(
  exercises: ActivityExerciseSegment[],
  segmentEnergyKcal: { index: number; energyKcal: number }[]
): ActivityExerciseSegment[] {
  const next = exercises.map((e) => {
    if (e.kind === 'manual_exercise') {
      return { ...e };
    }
    return e;
  });

  for (const { index, energyKcal } of segmentEnergyKcal) {
    if (index < 0 || index >= next.length) continue;
    const seg = next[index];
    if (seg.kind === 'manual_exercise') {
      next[index] = { ...seg, energyKcal: Math.max(0, Math.round(energyKcal)) };
    }
  }
  return next;
}

function inferActivityAnalysisStatusForInsert(caloriesBurned: number | null | undefined, exercises: ActivityExerciseSegment[]): 'pending' | 'completed' {
  if (caloriesBurned != null && caloriesBurned > 0) return 'completed';
  for (const ex of exercises ?? []) {
    if (ex.kind === 'healthkit_workout_segment' && ex.energyKcal != null && ex.energyKcal > 0) return 'completed';
    if (ex.kind === 'manual_exercise' && ex.energyKcal != null && ex.energyKcal > 0) return 'completed';
  }
  return 'pending';
}

async function processActivityBurnAsync(
  activityLogId: string,
  userId: string,
  name: string,
  description: string | null,
  exercises: ActivityExerciseSegment[]
): Promise<void> {
  await supabaseAdmin
    .from('activity_logs')
    .update({ analysis_status: 'analyzing' })
    .eq('id', activityLogId)
    .eq('user_id', userId);

  try {
    const profile = await fetchUserProfileForBurn(userId);
    const burn = await activityAiService.estimateCaloriesBurned(
      {
        profile,
        activityName: name,
        activityDescription: description ?? '',
        exercises,
      },
      { userId, route: 'async/activity-logs/burn' }
    );

    const updatedExercises = applyBurnToExercises(exercises, burn.segmentEnergyKcal);

    const { error } = await supabaseAdmin
      .from('activity_logs')
      .update({
        calories_burned: Math.max(0, Math.round(burn.totalCaloriesBurned)),
        exercises: updatedExercises as ActivityExerciseSegment[],
        analysis_status: 'completed',
      })
      .eq('id', activityLogId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (e) {
    console.error('[processActivityBurnAsync]', e);
    await supabaseAdmin
      .from('activity_logs')
      .update({ analysis_status: 'failed' })
      .eq('id', activityLogId)
      .eq('user_id', userId);
  }
}

/** Conversational parse — no persistence. */
router.post('/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = activitySummaryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { activityDescription, conversationHistory } = parsed.data;

    let intent: 'log' | 'off_topic' = 'log';
    try {
      intent = await activityChatIntentClassifier.classify(
        {
          activityDescription,
          conversationHistory,
        },
        { userId: req.user!.id, route: 'activity-logs/summary' }
      );
    } catch (e) {
      if (e instanceof LlmQuotaExceededError) throw e;
      console.error('[activity-logs/summary] classifier error, defaulting to log:', e);
    }

    if (intent === 'off_topic') {
      res.json({
        summary: buildActivityChatGuardrailSummary(
          'I can help you log workouts and activities (runs, lifts, sports). Tell me what you did in plain language.'
        ),
      });
      return;
    }

    const summary = await activityAiService.analyzeActivityConversation(
      activityDescription,
      conversationHistory,
      { userId: req.user!.id, route: 'activity-logs/summary' }
    );
    res.json({ summary });
  } catch (e) {
    console.error('POST /activity-logs/summary:', e);
    if (replyIfLlmQuotaExceeded(res, e)) return;
    res.status(500).json({ error: 'Failed to summarize activity' });
  }
});

/** Chat-created log: pending burn, then async analysis. */
router.post('/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createActivityLogFromChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const body = parsed.data;
    const userId = req.user!.id;
    const manualValidationErrors = validateManualExercisesForResponse(body.exercises);
    if (manualValidationErrors.length > 0) {
      res.status(400).json({
        error: 'Manual activity details are incomplete',
        details: manualValidationErrors,
      });
      return;
    }

    const insertRow = {
      user_id: userId,
      activity_id: null,
      name: body.name,
      description: body.description ?? null,
      calories_burned: null,
      exercises: body.exercises as ActivityExerciseSegment[],
      logged_at: body.loggedAt,
      external_source: null,
      external_id: null,
      analysis_status: 'pending' as const,
    };

    const { data, error } = await supabaseAdmin.from('activity_logs').insert(insertRow).select('*').single();

    if (error) {
      console.error('activity_logs insert (create) error:', error);
      res.status(500).json({ error: 'Failed to create activity log' });
      return;
    }

    const row = data as {
      id: string;
      name: string;
      description: string | null;
      exercises: ActivityExerciseSegment[];
    };

    setImmediate(() => {
      processActivityBurnAsync(row.id, userId, row.name, row.description, row.exercises).catch((err) =>
        console.error('Failed activity burn async:', err)
      );
    });

    posthog.capture({
      distinctId: userId,
      event: 'activity log created',
      properties: {
        activity_name: body.name,
        exercise_count: body.exercises.length,
        source: 'chat',
      },
    });

    res.status(201).json({ message: 'Activity log created, burn estimate in progress', data });
  } catch (e) {
    console.error('POST /activity-logs/create:', e);
    if (replyIfLlmQuotaExceeded(res, e)) return;
    posthog.captureException(e, req.user?.id);
    res.status(500).json({ error: 'Failed to create activity log' });
  }
});

router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const rawLimit = req.query.limit;
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(rawLimit ?? '20'), 10) || 20));

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ data: data ?? [] });
  } catch (e) {
    console.error('GET /activity-logs/recent:', e);
    res.status(500).json({ error: 'Failed to fetch recent activity logs' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createActivityLogBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const userId = req.user!.id;
    const manualValidationErrors = validateManualExercisesForResponse(body.exercises ?? []);
    if (manualValidationErrors.length > 0) {
      res.status(400).json({
        error: 'Manual activity details are incomplete',
        details: manualValidationErrors,
      });
      return;
    }

    const analysisStatus = inferActivityAnalysisStatusForInsert(body.caloriesBurned ?? null, body.exercises ?? []);

    const insertRow = {
      user_id: userId,
      activity_id: body.activityId ?? null,
      name: body.name,
      description: body.description ?? null,
      calories_burned: body.caloriesBurned ?? null,
      exercises: body.exercises as ActivityExerciseSegment[],
      logged_at: body.loggedAt,
      external_source: body.externalSource ?? null,
      external_id: body.externalId ?? null,
      analysis_status: analysisStatus,
    };

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .insert(insertRow)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'This activity is already logged', code: 'duplicate' });
        return;
      }
      console.error('activity_logs insert error:', error);
      res.status(500).json({ error: 'Failed to create activity log' });
      return;
    }

    const row = data as {
      id: string;
      name: string;
      description: string | null;
      exercises: ActivityExerciseSegment[];
      analysis_status: string;
    };

    if (row.analysis_status === 'pending') {
      setImmediate(() => {
        processActivityBurnAsync(row.id, userId, row.name, row.description, row.exercises).catch((err) =>
          console.error('Failed activity burn async (POST /):', err)
        );
      });
    }

    posthog.capture({
      distinctId: userId,
      event: 'activity log created',
      properties: {
        activity_name: body.name,
        exercise_count: (body.exercises ?? []).length,
        calories_burned: body.caloriesBurned ?? null,
        external_source: body.externalSource ?? null,
        source: 'direct',
      },
    });

    res.status(201).json(data);
  } catch (e) {
    console.error('POST /activity-logs:', e);
    if (replyIfLlmQuotaExceeded(res, e)) return;
    posthog.captureException(e, req.user?.id);
    res.status(500).json({ error: 'Failed to create activity log' });
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Activity log not found' });
      return;
    }
    res.json(data);
  } catch (e) {
    console.error('GET /activity-logs/:id:', e);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = patchActivityLogBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }

    const { id } = req.params;
    const userId = req.user!.id;
    const p = parsed.data;
    if (p.exercises !== undefined) {
      const manualValidationErrors = validateManualExercisesForResponse(p.exercises);
      if (manualValidationErrors.length > 0) {
        res.status(400).json({
          error: 'Manual activity details are incomplete',
          details: manualValidationErrors,
        });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (p.loggedAt !== undefined) updates.logged_at = p.loggedAt;
    if (p.name !== undefined) updates.name = p.name;
    if (p.description !== undefined) updates.description = p.description;
    if (p.caloriesBurned !== undefined) updates.calories_burned = p.caloriesBurned;
    if (p.exercises !== undefined) updates.exercises = p.exercises;

    const contentChanged =
      p.name !== undefined || p.description !== undefined || p.exercises !== undefined;
    const userLockedCalories = p.caloriesBurned !== undefined && p.caloriesBurned != null;

    let shouldQueueBurn = false;
    if (userLockedCalories) {
      updates.analysis_status = 'completed';
    } else if (contentChanged) {
      updates.analysis_status = 'pending';
      updates.calories_burned = null;
      shouldQueueBurn = true;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Activity log not found' });
      return;
    }

    const row = data as {
      id: string;
      name: string;
      description: string | null;
      exercises: ActivityExerciseSegment[];
      analysis_status: string;
    };

    if (row.analysis_status === 'pending' && shouldQueueBurn) {
      setImmediate(() => {
        processActivityBurnAsync(row.id, userId, row.name, row.description, row.exercises).catch((err) =>
          console.error('Failed activity burn async (PATCH):', err)
        );
      });
    }

    posthog.capture({
      distinctId: userId,
      event: 'activity log updated',
      properties: {
        activity_log_id: id,
        fields_updated: Object.keys(updates),
      },
    });

    res.json(data);
  } catch (e) {
    console.error('PATCH /activity-logs/:id:', e);
    if (replyIfLlmQuotaExceeded(res, e)) return;
    posthog.captureException(e, req.user?.id);
    res.status(500).json({ error: 'Failed to update activity log' });
  }
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('activity_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Activity log not found' });
      return;
    }

    posthog.capture({
      distinctId: userId,
      event: 'activity log deleted',
      properties: {
        activity_log_id: id,
      },
    });

    res.status(204).send();
  } catch (e) {
    console.error('DELETE /activity-logs/:id:', e);
    posthog.captureException(e, req.user?.id);
    res.status(500).json({ error: 'Failed to delete activity log' });
  }
});

export default router;
