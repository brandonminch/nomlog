import { useEffect, useMemo, useState } from 'react';
import type { UserProfile, PrimaryGoal } from './useUserProfile';
import { ApiError } from '../lib/api';
import { useOnboardingMutations } from './useOnboardingMutations';
import { patchWithOptionalNutritionRecalc } from '../lib/nutritionRecalcPrompt';

export type Step = 'name' | 'goal' | 'age' | 'height' | 'weight' | 'sex' | 'activity';

type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say' | null;
type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active'
  | null;

export const useOnboardingFlow = (profile: UserProfile | null) => {
  const { patchProfile, patchProfileAsync, patchStats, isSavingProfile, isSavingStats } =
    useOnboardingMutations();

  const [step, setStep] = useState<Step>('name');
  const [preferredName, setPreferredName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<PrimaryGoal | null>(profile?.primary_goal ?? null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [hasHydratedFromProfile, setHasHydratedFromProfile] = useState(false);
  /** ISO YYYY-MM-DD */
  const [dateOfBirthIso, setDateOfBirthIso] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(null);
  const [activeBotKey, setActiveBotKey] = useState<string | null>(null);
  const [isBotStreaming, setIsBotStreaming] = useState(false);
  const [lastBotKey, setLastBotKey] = useState<string | null>(null);
  const [hasSubmittedName, setHasSubmittedName] = useState(false);

  const hasName = preferredName.trim().length > 0;

  // Reset state completely when there is explicitly no profile (404 case)
  useEffect(() => {
    if (profile === null) {
      setStep('name');
      setPreferredName('');
      setNameError(null);
      setSelectedGoal(null);
      setGoalError(null);
      setDateOfBirthIso('');
      setHeight('');
      setWeight('');
      setBiologicalSex(null);
      setActivityLevel(null);
      setHasHydratedFromProfile(false);
      setActiveBotKey('intro');
      setLastBotKey('intro');
      setIsBotStreaming(true);
      setHasSubmittedName(false);
    }
  }, [profile]);

  // Hydrate onboarding state from any existing profile data so users resume where they left off.
  useEffect(() => {
    if (!profile || hasHydratedFromProfile) return;

    const existingName = profile.display_name ?? '';
    if (existingName) {
      setPreferredName(existingName);
      setHasSubmittedName(true);
    }

    if (profile.primary_goal) {
      setSelectedGoal(profile.primary_goal);
    }

    if (profile.date_of_birth) {
      setDateOfBirthIso(profile.date_of_birth);
    }

    if (profile.height_cm != null) {
      if (profile.preferred_height_unit === 'ft_in') {
        const totalInches = profile.height_cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches - feet * 12);
        setHeight(`${feet}'${inches}"`);
      } else {
        setHeight(`${Math.round(profile.height_cm)}cm`);
      }
    }

    if (profile.weight_kg != null) {
      if (profile.preferred_weight_unit === 'lbs') {
        const lbs = profile.weight_kg / 0.45359237;
        setWeight(`${Math.round(lbs)} lbs`);
      } else {
        setWeight(`${Math.round(profile.weight_kg)} kg`);
      }
    }

    if (profile.biological_sex) {
      setBiologicalSex(profile.biological_sex);
    }

    if (profile.activity_level) {
      setActivityLevel(profile.activity_level);
    }

    let initialStep: Step = 'name';
    let initialBotKey: string = 'intro';
    if (!existingName) {
      initialStep = 'name';
      initialBotKey = 'intro';
    } else if (!profile.primary_goal) {
      initialStep = 'goal';
      initialBotKey = 'goalPrompt';
    } else if (!profile.date_of_birth) {
      initialStep = 'age';
      initialBotKey = 'age';
    } else if (profile.height_cm == null) {
      initialStep = 'height';
      initialBotKey = 'height';
    } else if (profile.weight_kg == null) {
      initialStep = 'weight';
      initialBotKey = 'weight';
    } else if (!profile.biological_sex) {
      initialStep = 'sex';
      initialBotKey = 'sexPrompt';
    } else if (!profile.activity_level) {
      initialStep = 'activity';
      initialBotKey = 'activityPrompt';
    } else {
      initialStep = 'activity';
      initialBotKey = 'reviewIntro';
    }

    setStep(initialStep);
    setActiveBotKey(initialBotKey);
    setLastBotKey(initialBotKey);
    setIsBotStreaming(true);
    setHasHydratedFromProfile(true);
  }, [profile, hasHydratedFromProfile]);

  // When the step changes in normal flow, trigger the appropriate bot line to stream.
  useEffect(() => {
    let key: string | null = null;
    switch (step) {
      case 'name':
        key = 'intro';
        break;
      case 'goal':
        key = 'goalPrompt';
        break;
      case 'age':
        key = 'age';
        break;
      case 'height':
        key = 'height';
        break;
      case 'weight':
        key = 'weight';
        break;
      case 'sex':
        key = 'sexPrompt';
        break;
      case 'activity':
        key =
          lastBotKey === 'activityPrompt'
            ? 'activityPrompt'
            : profile?.has_completed_onboarding
              ? 'activityPrompt'
              : 'reviewIntro';
        break;
      default:
        key = null;
    }

    if (key && key !== lastBotKey) {
      setLastBotKey(key);
      setActiveBotKey(key);
      setIsBotStreaming(true);
    }
  }, [step, lastBotKey, profile?.has_completed_onboarding]);

  const hasCompletedName = useMemo(
    () => hasSubmittedName || !!profile?.display_name,
    [hasSubmittedName, profile?.display_name]
  );

  const isSummaryReady = useMemo(
    () =>
      !!(
        profile?.primary_goal &&
        profile.date_of_birth &&
        profile.height_cm != null &&
        profile.weight_kg != null &&
        profile.biological_sex &&
        profile.activity_level
      ),
    [
      profile?.primary_goal,
      profile?.date_of_birth,
      profile?.height_cm,
      profile?.weight_kg,
      profile?.biological_sex,
      profile?.activity_level,
    ]
  );

  // Handlers
  const handleNameContinue = () => {
    const trimmed = preferredName.trim();
    setNameError(null);

    if (!trimmed) {
      setNameError('Please enter a name to continue.');
      return;
    }

    patchProfile(
      { display_name: trimmed },
      {
        onSuccess: (updatedProfile) => {
          const savedName = updatedProfile?.display_name ?? trimmed;
          setPreferredName(savedName);
          setHasSubmittedName(true);
          setStep('goal');
        },
        onError: (error: ApiError | Error) => {
          const message =
            error instanceof ApiError
              ? error.message || 'I could not save that just now. Please try again.'
              : 'I could not save that just now. Please try again.';
          setNameError(message);
        },
      }
    );
  };

  const handleStatsContinue = async () => {
    if (step === 'age') {
      const iso = dateOfBirthIso.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        setGoalError('Please choose your date of birth.');
        return;
      }
      try {
        setGoalError(null);
        const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
          patchStats({ date_of_birth: iso, recalculate_nutrition_targets: recalc })
        );
        if (!ok) return;
        setStep('height');
      } catch {
        // stay on age
      }
    } else if (step === 'height') {
      const trimmed = height.trim();
      if (!trimmed) return;
      try {
        setGoalError(null);
        const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
          patchStats({ height_input: trimmed, recalculate_nutrition_targets: recalc })
        );
        if (!ok) return;
        setHeight(trimmed);
        setStep('weight');
      } catch {
        // stay on height
      }
    } else if (step === 'weight') {
      const trimmed = weight.trim();
      if (!trimmed) return;
      try {
        setGoalError(null);
        const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
          patchStats({ weight_input: trimmed, recalculate_nutrition_targets: recalc })
        );
        if (!ok) return;
        setStep('sex');
      } catch {
        // stay on weight
      }
    }
  };

  const handleSexSelect = async (value: NonNullable<BiologicalSex>) => {
    const previous = biologicalSex;
    setGoalError(null);
    setBiologicalSex(value);
    try {
      const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
        patchProfileAsync({ biological_sex: value, recalculate_nutrition_targets: recalc })
      );
      if (!ok) {
        setBiologicalSex(previous);
        return;
      }
      setStep('activity');
      setLastBotKey('activityPrompt');
      setActiveBotKey('activityPrompt');
      setIsBotStreaming(true);
    } catch {
      setBiologicalSex(previous);
    }
  };

  const handleActivitySelect = async (value: NonNullable<ActivityLevel>) => {
    const previous = activityLevel;
    setGoalError(null);
    setActivityLevel(value);
    setLastBotKey('reviewIntro');
    setActiveBotKey('reviewIntro');
    setIsBotStreaming(true);
    try {
      const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
        patchProfileAsync({ activity_level: value, recalculate_nutrition_targets: recalc })
      );
      if (!ok) {
        setActivityLevel(previous);
      }
    } catch {
      setActivityLevel(previous);
    }
  };

  const handleGoalSelect = async (goal: PrimaryGoal) => {
    const prevSelected = selectedGoal;
    const hadGoal = !!(selectedGoal ?? profile?.primary_goal);
    setSelectedGoal(goal);
    setGoalError(null);
    try {
      const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
        patchProfileAsync({ primary_goal: goal, recalculate_nutrition_targets: recalc })
      );
      if (!ok) {
        setSelectedGoal(prevSelected);
        return;
      }
      if (!hadGoal) {
        setStep('age');
      }
    } catch {
      setSelectedGoal(prevSelected);
    }
  };

  const handleCompleteFromSummary = async () => {
    const trimmedName = preferredName.trim();
    const trimmedHeight = height.trim();
    const trimmedWeight = weight.trim();
    const dob = dateOfBirthIso.trim();

    const profileUpdates: import('./useOnboardingMutations').OnboardingProfileUpdates = {
      has_completed_onboarding: true,
    };

    if (trimmedName && trimmedName !== (profile?.display_name ?? '')) {
      profileUpdates.display_name = trimmedName;
    }
    if (selectedGoal && selectedGoal !== profile?.primary_goal) {
      profileUpdates.primary_goal = selectedGoal;
    }
    if (biologicalSex && biologicalSex !== profile?.biological_sex) {
      profileUpdates.biological_sex = biologicalSex;
    }
    if (activityLevel && activityLevel !== profile?.activity_level) {
      profileUpdates.activity_level = activityLevel as NonNullable<ActivityLevel>;
    }

    const statsPayload: import('./useOnboardingMutations').OnboardingStatsPayload = {};
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      statsPayload.date_of_birth = dob;
    }
    if (trimmedHeight) statsPayload.height_input = trimmedHeight;
    if (trimmedWeight) statsPayload.weight_input = trimmedWeight;

    setGoalError(null);
    setNameError(null);

    const merged: import('./useOnboardingMutations').FullProfilePatch = {
      ...profileUpdates,
      ...statsPayload,
    };

    try {
      if (Object.keys(merged).length === 0) return;

      const ok = await patchWithOptionalNutritionRecalc(profile, (recalc) =>
        patchProfileAsync({ ...merged, recalculate_nutrition_targets: recalc })
      );
      if (!ok) return;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message || 'I could not save that just now. Please try again.'
          : 'I could not save that just now. Please try again.';
      setGoalError(message);
      throw error;
    }
  };

  return {
    // core flow state
    step,
    preferredName,
    selectedGoal,
    dateOfBirthIso,
    height,
    weight,
    biologicalSex,
    activityLevel,
    nameError,
    goalError,
    hasSubmittedName,
    hasName,
    hasCompletedName,
    isBotStreaming,
    activeBotKey,
    lastBotKey,
    isSavingProfile,
    isSavingStats,
    isSummaryReady,

    // setters and transitions
    setStep,
    setPreferredName,
    setSelectedGoal,
    setDateOfBirthIso,
    setHeight,
    setWeight,
    setBiologicalSex,
    setActivityLevel,
    setNameError,
    setGoalError,
    setHasSubmittedName,
    setIsBotStreaming,
    setActiveBotKey,
    setLastBotKey,

    // high-level actions
    handleNameContinue,
    handleStatsContinue,
    handleSexSelect,
    handleActivitySelect,
    handleGoalSelect,
    handleCompleteFromSummary,
  };
};
