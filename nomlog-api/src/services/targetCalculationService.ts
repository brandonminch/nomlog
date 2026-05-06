import type { PrimaryGoal } from '../types/userProfile';

type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active';

interface BaseTargetInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  biologicalSex: BiologicalSex;
  primaryGoal: PrimaryGoal;
}

export interface StaticTargetInput extends BaseTargetInput {
  activityLevel: ActivityLevel;
}

export interface TargetOutput {
  bmr: number;
  tdee: number;
  targetCalories: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

function calculateBmr(params: Pick<BaseTargetInput, 'weightKg' | 'heightCm' | 'ageYears' | 'biologicalSex'>) {
  const { weightKg, heightCm, ageYears, biologicalSex } = params;

  const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;

  if (biologicalSex === 'male') return bmrMale;
  if (biologicalSex === 'female') return bmrFemale;

  return (bmrMale + bmrFemale) / 2;
}

function estimateStaticTdee(bmr: number, activityLevel: ActivityLevel): number {
  const activityMultipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extremely_active: 1.9,
  };

  const multiplier = activityMultipliers[activityLevel] ?? 1.2;
  return bmr * multiplier;
}

export function calculateTargetsWithTdee(input: BaseTargetInput, tdee: number): TargetOutput {
  const { biologicalSex, primaryGoal, weightKg, heightCm, ageYears } = input;

  let targetCalories = tdee;
  switch (primaryGoal) {
    case 'lose_weight':
      targetCalories = tdee * 0.8;
      break;
    case 'build_muscle':
      targetCalories = tdee * 1.1;
      break;
    case 'training_event':
      targetCalories = tdee * 1.05;
      break;
    case 'maintain_weight':
    case 'track_intake':
    default:
      targetCalories = tdee;
      break;
  }

  const isMale = biologicalSex === 'male';
  const minCalories = isMale ? 1500 : 1200;
  if (targetCalories < minCalories) {
    targetCalories = minCalories;
  }

  let proteinPerKg: number;
  switch (primaryGoal) {
    case 'lose_weight':
      proteinPerKg = 2.0;
      break;
    case 'build_muscle':
      proteinPerKg = 2.2;
      break;
    case 'training_event':
      proteinPerKg = 1.8;
      break;
    case 'maintain_weight':
    case 'track_intake':
    default:
      proteinPerKg = 1.6;
      break;
  }

  const proteinG = weightKg * proteinPerKg;
  const proteinCalories = proteinG * 4;

  const fatCalories = targetCalories * 0.25;
  const fatG = fatCalories / 9;

  let remainingCalories = targetCalories - proteinCalories - fatCalories;
  if (remainingCalories < 0) {
    remainingCalories = 0;
  }
  const carbG = remainingCalories / 4;

  return {
    bmr: Math.round(calculateBmr({ weightKg, heightCm, ageYears, biologicalSex })),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    proteinG: Math.round(proteinG),
    carbG: Math.round(carbG),
    fatG: Math.round(fatG),
  };
}

export function calculateTargets(params: StaticTargetInput): TargetOutput {
  const { weightKg, heightCm, ageYears, biologicalSex, activityLevel, primaryGoal } = params;

  const bmr = calculateBmr({ weightKg, heightCm, ageYears, biologicalSex });
  const tdee = estimateStaticTdee(bmr, activityLevel);

  return calculateTargetsWithTdee(
    {
      weightKg,
      heightCm,
      ageYears,
      biologicalSex,
      primaryGoal,
    },
    tdee,
  );
}

