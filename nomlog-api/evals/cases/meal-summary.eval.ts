import { runEvals, EvalCase } from '../runner';
import { NutritionService } from '../../src/services/nutritionService';

const service = new NutritionService();

type MealSummaryInput =
  | string
  | {
      mealDescription: string;
      conversationHistory?: Array<{ question: string; answer: string }>;
    };

const cases: EvalCase[] = [
  {
    description: 'Returns clarifying question for vague composite meal',
    input: 'I had a burrito',
    check: (r) => {
      const o = r as { questions?: unknown[] };
      return Array.isArray(o.questions) && o.questions.length > 0;
    },
  },
  {
    description: 'Returns no questions for specific meal',
    input: '2 scrambled eggs and a slice of whole wheat toast',
    check: (r) => {
      const o = r as { questions?: unknown[] };
      return Array.isArray(o.questions) && o.questions.length === 0;
    },
  },
  {
    description: 'Never asks more than 2 questions',
    input: 'I had something for lunch',
    check: (r) => {
      const o = r as { questions?: unknown[] };
      return Array.isArray(o.questions) && o.questions.length <= 2;
    },
  },
  {
    description: 'Does NOT return totalNutrition (wrong step)',
    input: 'chicken sandwich with fries',
    check: (r) => {
      const o = r as { totalNutrition?: unknown };
      return o.totalNutrition === undefined;
    },
  },
  {
    description: 'Returns correct ingredient shape when ingredients present',
    input: '2 scrambled eggs and a slice of whole wheat toast',
    check: (r) => {
      const o = r as {
        ingredients?: Array<{
          name: unknown;
          servingAmount: unknown;
          servingUnit: unknown;
          servingSizeGrams: unknown;
          provenance?: { source?: string };
        }>;
      };
      if (!Array.isArray(o.ingredients) || o.ingredients.length === 0) return false;
      return o.ingredients.every(
        (i) =>
          typeof i.name === 'string' &&
          typeof i.servingAmount === 'number' &&
          typeof i.servingUnit === 'string' &&
          typeof i.servingSizeGrams === 'number' &&
          i.provenance?.source === 'llm_estimate'
      );
    },
  },
  {
    description: 'Name is max 40 characters',
    input: 'large pepperoni pizza with extra cheese and mushrooms and jalapeños',
    check: (r) => {
      const o = r as { name?: string };
      return typeof o.name === 'string' && o.name.length <= 40;
    },
  },
  {
    description: 'Does not re-ask questions already answered in conversation history',
    input: {
      mealDescription: 'with rice and black beans',
      conversationHistory: [{ question: 'Was the burrito chicken or beef?', answer: 'Chicken' }],
    },
    check: (r) => {
      const o = r as { questions?: unknown[] };
      return Array.isArray(o.questions) && o.questions.length === 0;
    },
  },
  {
    description: 'Question options do not include catch-all like "Other"',
    input: 'I had a sandwich',
    check: (r) => {
      const o = r as { questions?: Array<{ options?: string[] }> };
      if (!o.questions?.length) return true;
      return o.questions.every(
        (q) => !q.options?.some((opt) => opt.toLowerCase().startsWith('other'))
      );
    },
  },
  {
    description: 'Clarifying questions never combine type/size into one ask',
    input: 'I had a pizza and fries',
    check: (r) => {
      const o = r as { questions?: Array<{ text?: string }> };
      if (!o.questions?.length) return true;
      return o.questions.every(
        (q) =>
          !/(type|kind|brand|flavor|size|portion|amount)\b[\s\S]*\band\b[\s\S]*(type|kind|brand|flavor|size|portion|amount)/i.test(
            q.text || ''
          )
      );
    },
  },
];

async function handle(input: unknown) {
  const i = input as MealSummaryInput;
  if (typeof i === 'string') {
    return service.analyzeMealConversation(i);
  }
  return service.analyzeMealConversation(i.mealDescription, i.conversationHistory);
}

runEvals('meal-summary', cases, handle)
  .then((summary) => {
    if (summary.failures.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
