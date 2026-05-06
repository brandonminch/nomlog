import { runEvals, EvalCase } from '../runner';
import { ActivityAiService } from '../../src/services/activityAiService';

const service = new ActivityAiService();

const cases: EvalCase[] = [
  {
    description: 'Returns empty questions array (never asks volume questions)',
    input: '3 mile run',
    check: (r) => {
      const o = r as { questions?: unknown[] };
      return Array.isArray(o.questions) && o.questions.length === 0;
    },
  },
  {
    description: 'Cardio item has correct kind',
    input: '5k run this morning',
    check: (r) => {
      const o = r as { items?: Array<{ kind?: string }> };
      return Array.isArray(o.items) && o.items.some((i) => i.kind === 'cardio');
    },
  },
  {
    description: 'Strength item has correct kind',
    input: 'bench press 3x10 at 135lbs',
    check: (r) => {
      const o = r as { items?: Array<{ kind?: string }> };
      return Array.isArray(o.items) && o.items.some((i) => i.kind === 'strength');
    },
  },
  {
    description: 'Does NOT return calories or kcal fields on summary or items',
    input: '30 minute bike ride',
    check: (r) => {
      const o = r as {
        totalCalories?: unknown;
        items?: Array<Record<string, unknown>>;
      };
      if (o.totalCalories !== undefined) return false;
      if (!Array.isArray(o.items)) return false;
      return o.items.every((item) => item.calories === undefined && item.kcal === undefined);
    },
  },
  {
    description: 'Name is max 40 characters',
    input: 'long morning run followed by upper body weights and stretching',
    check: (r) => {
      const o = r as { name?: string };
      return typeof o.name === 'string' && o.name.length <= 40;
    },
  },
  {
    description: 'Strength sets use weightLbs not weightKg',
    input: 'squats 4x8 at 185 pounds',
    check: (r) => {
      const o = r as {
        items?: Array<{ kind?: string; sets?: Array<{ weightKg?: unknown }> }>;
      };
      const strengthItem = o.items?.find((i) => i.kind === 'strength');
      if (!strengthItem?.sets?.length) return false;
      return strengthItem.sets.every((set) => set.weightKg === undefined);
    },
  },
];

runEvals('activity-summary', cases, (input) =>
  service.analyzeActivityConversation(input as string)
)
  .then((summary) => {
    if (summary.failures.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
