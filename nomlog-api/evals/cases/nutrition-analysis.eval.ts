import { runEvals, EvalCase } from '../runner';
import { NutritionService } from '../../src/services/nutritionService';

const service = new NutritionService();

const cases: EvalCase[] = [
  {
    description: 'Returns totalNutrition with required macro fields',
    input: '2 scrambled eggs and whole wheat toast',
    check: (r) => {
      const o = r as { totalNutrition?: Record<string, unknown> };
      const n = o.totalNutrition;
      return (
        n != null &&
        typeof n.calories === 'number' &&
        typeof n.protein === 'number' &&
        typeof n.carbohydrates === 'number' &&
        typeof n.fat === 'number'
      );
    },
  },
  {
    description: 'Does NOT return a questions field',
    input: 'grilled chicken salad',
    check: (r) => {
      const o = r as { questions?: unknown };
      return o.questions === undefined;
    },
  },
  {
    description: 'Each ingredient has a nutrition object with calories',
    input: 'bowl of oatmeal with banana and honey',
    check: (r) => {
      const o = r as { ingredients?: Array<{ nutrition?: { calories?: unknown } }> };
      return (
        Array.isArray(o.ingredients) &&
        o.ingredients.length > 0 &&
        o.ingredients.every((i) => typeof i.nutrition?.calories === 'number')
      );
    },
  },
  {
    description: 'Calorie total is plausible (> 0 and < 5000)',
    input: 'cheeseburger with fries and a coke',
    check: (r) => {
      const o = r as { totalNutrition?: { calories?: number } };
      const c = o.totalNutrition?.calories;
      return c != null && c > 0 && c < 5000;
    },
  },
  {
    description:
      'Ingredient calories sum is roughly consistent with totalNutrition calories (within 20%)',
    input: '2 eggs, 2 strips of bacon, and coffee with cream',
    check: (r) => {
      const o = r as {
        totalNutrition?: { calories?: number };
        ingredients?: Array<{ nutrition?: { calories?: number } }>;
      };
      const total = o.totalNutrition?.calories;
      const sum = o.ingredients?.reduce((acc, i) => acc + (i.nutrition?.calories ?? 0), 0);
      if (total == null || sum == null || total === 0) return false;
      return Math.abs(total - sum) / total < 0.2;
    },
  },
  {
    description: 'Name is max 40 characters',
    input: 'very large breakfast platter with eggs bacon sausage toast and home fries',
    check: (r) => {
      const o = r as { name?: string };
      return typeof o.name === 'string' && o.name.length <= 40;
    },
  },
];

runEvals('nutrition-analysis', cases, (input) => service.analyzeMeal(input as string))
  .then((summary) => {
    if (summary.failures.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
