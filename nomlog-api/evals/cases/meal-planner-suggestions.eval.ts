import { runEvals, EvalCase } from '../runner';
import { MealPlanningService } from '../../src/services/mealPlanningService';

/**
 * `suggestMeals` is grounded in the recipe catalog (no LLM). These evals assert
 * response shape so regressions in planner guardrails / hydration are caught
 * when a dev database has matching recipes. With zero catalog matches, options
 * may be empty — cases allow that while still validating invariants.
 */
const service = new MealPlanningService();

const userId = '00000000-0000-0000-0000-000000000001';

const cases: EvalCase[] = [
  {
    description: 'Response has personalizationNote and at most 4 options',
    input: { prompt: 'something high protein for dinner' },
    check: (r) => {
      const o = r as { personalizationNote?: string; options?: unknown[] };
      return (
        typeof o.personalizationNote === 'string' &&
        o.personalizationNote.length > 0 &&
        Array.isArray(o.options) &&
        o.options.length <= 4
      );
    },
  },
  {
    description: 'When options exist, each has required nutrition fields',
    input: { prompt: 'quick lunch idea' },
    check: (r) => {
      const o = r as {
        options?: Array<{
          nutrition?: {
            calories?: unknown;
            protein?: unknown;
            carbohydrates?: unknown;
            fat?: unknown;
          };
        }>;
      };
      if (!o.options?.length) return true;
      return o.options.every(
        (opt) =>
          typeof opt.nutrition?.calories === 'number' &&
          typeof opt.nutrition?.protein === 'number' &&
          typeof opt.nutrition?.carbohydrates === 'number' &&
          typeof opt.nutrition?.fat === 'number'
      );
    },
  },
  {
    description: 'When options exist without recipe context injection, recipe meta is still valid if present',
    input: { prompt: 'healthy breakfast' },
    check: (r) => {
      const o = r as {
        options?: Array<{ recipe?: { recipeId?: string; sourceKey?: string; slug?: string } }>;
      };
      if (!o.options?.length) return true;
      return o.options.every((opt) => {
        if (!opt.recipe) return true;
        return (
          typeof opt.recipe.recipeId === 'string' &&
          opt.recipe.recipeId.length > 0 &&
          typeof opt.recipe.sourceKey === 'string' &&
          typeof opt.recipe.slug === 'string'
        );
      });
    },
  },
  {
    description: 'Each option mealType is one of the allowed slots when set',
    input: { prompt: 'dinner suggestion' },
    check: (r) => {
      const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
      const o = r as { options?: Array<{ mealType?: string }> };
      if (!o.options?.length) return true;
      return o.options.every((opt) => !opt.mealType || slots.includes(opt.mealType));
    },
  },
];

type SuggestionInput = { prompt: string };

runEvals('meal-planner-suggestions', cases, async (input) => {
  const args = input as SuggestionInput;
  return service.suggestMeals({
    prompt: args.prompt,
    profile: null,
    userId,
  });
})
  .then((summary) => {
    if (summary.failures.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
