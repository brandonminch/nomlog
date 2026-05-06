import { calculateTargets } from './targetCalculationService';

describe('calculateTargets', () => {
  it('calculates lose_weight targets using 20% deficit and protein 2.0 g/kg', () => {
    const result = calculateTargets({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      biologicalSex: 'male',
      activityLevel: 'moderately_active',
      primaryGoal: 'lose_weight',
    });

    expect(result.bmr).toBeGreaterThan(0);
    expect(result.tdee).toBeGreaterThan(result.targetCalories);
    expect(result.targetCalories).toBeLessThan(result.tdee);
    expect(result.proteinG).toBeCloseTo(160, 0); // 80kg * 2.0
  });

  it('applies guardrail minimum calories by sex', () => {
    const resultFemale = calculateTargets({
      weightKg: 45,
      heightCm: 150,
      ageYears: 50,
      biologicalSex: 'female',
      activityLevel: 'sedentary',
      primaryGoal: 'lose_weight',
    });

    expect(resultFemale.targetCalories).toBeGreaterThanOrEqual(1200);

    const resultMale = calculateTargets({
      weightKg: 50,
      heightCm: 160,
      ageYears: 50,
      biologicalSex: 'male',
      activityLevel: 'sedentary',
      primaryGoal: 'lose_weight',
    });

    expect(resultMale.targetCalories).toBeGreaterThanOrEqual(1500);
  });

  it('never returns negative carbs', () => {
    const result = calculateTargets({
      weightKg: 120,
      heightCm: 170,
      ageYears: 65,
      biologicalSex: 'female',
      activityLevel: 'sedentary',
      primaryGoal: 'build_muscle',
    });

    expect(result.carbG).toBeGreaterThanOrEqual(0);
  });
});

