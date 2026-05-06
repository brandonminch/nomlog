# Prompt Versioning & Evals — Implementation Spec

## Context

`nomlog-api` is an Express.js + TypeScript backend using Supabase (PostgreSQL) and OpenAI. Prompt templates currently live in `src/prompts/` as `.txt` files. This spec adds file-based independent versioning per prompt and a lightweight eval runner. No database changes required. Rollback = change one line in `index.ts` + redeploy.

---

## Current Prompts

```
src/prompts/
  activity-burn.txt
  activity-summary.txt
  meal-photo-summary.txt
  meal-planner-replace.txt
  meal-planner-suggestions.txt
  meal-planner-week.txt
  meal-summary.txt
  nutrition-analysis.txt
  recipe-enrichment.txt
```

---

## 1. New Directory Structure

Reorganize `src/prompts/` to support versioned files per prompt. Move each `.txt` file into its own subdirectory as `v1.txt`:

```
src/prompts/
  activity-burn/
    v1.txt          ← content moved from activity-burn.txt
  activity-summary/
    v1.txt
  meal-photo-summary/
    v1.txt
  meal-planner-replace/
    v1.txt
  meal-planner-suggestions/
    v1.txt
  meal-planner-week/
    v1.txt
  meal-summary/
    v1.txt
  nutrition-analysis/
    v1.txt
  recipe-enrichment/
    v1.txt
  index.ts          ← single file that controls which version is active per prompt
```

---

## 2. Prompt Index (`src/prompts/index.ts`)

This is the only file you edit to change which version is active. One line per prompt.

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

function load(name: string, version: string): string {
  return readFileSync(join(__dirname, name, `${version}.txt`), 'utf-8');
}

export const prompts = {
  activityBurn:           load('activity-burn',            'v1'),
  activitySummary:        load('activity-summary',         'v1'),
  mealPhotoSummary:       load('meal-photo-summary',       'v1'),
  mealPlannerReplace:     load('meal-planner-replace',     'v1'),
  mealPlannerSuggestions: load('meal-planner-suggestions', 'v1'),
  mealPlannerWeek:        load('meal-planner-week',        'v1'),
  mealSummary:            load('meal-summary',             'v1'),
  nutritionAnalysis:      load('nutrition-analysis',       'v1'),
  recipeEnrichment:       load('recipe-enrichment',        'v1'),
} as const;

export type PromptKey = keyof typeof prompts;
```

To roll back or upgrade a single prompt, change only that one line:
```typescript
// Promote to v2
mealSummary: load('meal-summary', 'v2'),

// Roll back to v1
mealSummary: load('meal-summary', 'v1'),
```

---

## 3. Usage in Services

Wherever services currently read prompt files directly, replace with an import from the index:

```typescript
// Before (however prompts are currently loaded)
import { readFileSync } from 'fs';
const prompt = readFileSync('src/prompts/meal-summary.txt', 'utf-8');

// After
import { prompts } from '../prompts';
const prompt = prompts.mealSummary;
```

All services should import from `../prompts` (or the correct relative path). No service should reference a versioned path directly — that stays centralized in `index.ts`.

---

## 4. Workflow for Updating a Prompt

1. Copy the current version to a new file:
   ```bash
   cp src/prompts/meal-summary/v1.txt src/prompts/meal-summary/v2.txt
   ```
2. Edit `v2.txt` with your changes
3. Temporarily point `index.ts` at `v2` and run evals (see section 6)
4. If evals pass, keep `v2` in `index.ts` and deploy
5. To roll back: change `index.ts` back to `v1` and redeploy

---

## 5. Eval Structure

```
nomlog-api/
  evals/
    runner.ts
    cases/
      meal-summary.eval.ts
      nutrition-analysis.eval.ts
      meal-planner-suggestions.eval.ts
      activity-summary.eval.ts
      router.eval.ts          ← add when router is built
```

---

## 6. Eval Runner (`evals/runner.ts`)

```typescript
export interface EvalCase {
  description: string;
  input: string | Record<string, unknown>;
  check: (output: any) => boolean;
}

export interface EvalSummary {
  service: string;
  passed: number;
  total: number;
  failures: { description: string; output?: any; error?: string }[];
}

export async function runEvals(
  serviceName: string,
  cases: EvalCase[],
  handler: (input: any) => Promise<any>
): Promise<EvalSummary> {
  console.log(`\nRunning evals: ${serviceName}`);
  console.log('─'.repeat(40));

  const summary: EvalSummary = {
    service: serviceName,
    passed: 0,
    total: cases.length,
    failures: [],
  };

  for (const c of cases) {
    try {
      const output = await handler(c.input);
      if (c.check(output)) {
        summary.passed++;
        console.log(`✅ ${c.description}`);
      } else {
        summary.failures.push({ description: c.description, output });
        console.log(`❌ ${c.description}`);
        console.log('   Output:', JSON.stringify(output, null, 2));
      }
    } catch (err: any) {
      summary.failures.push({ description: c.description, error: err.message });
      console.log(`❌ ${c.description} — ERROR: ${err.message}`);
    }
  }

  console.log(`\n${summary.passed}/${summary.total} passed\n`);
  return summary;
}
```

---

## 7. Eval Cases

### `evals/cases/meal-summary.eval.ts`

Tests the meal-summary prompt, which should identify missing info and ask clarifying questions — but must NOT compute nutrition.

```typescript
import { runEvals, EvalCase } from '../runner';
import { mealSummaryService } from '../../src/services/mealSummaryService'; // adjust to actual service path/name

const cases: EvalCase[] = [
  {
    description: 'Returns clarifying question for vague composite meal',
    input: 'I had a burrito',
    check: (r) => Array.isArray(r.questions) && r.questions.length > 0,
  },
  {
    description: 'Returns no questions for specific meal',
    input: '2 scrambled eggs and a slice of whole wheat toast',
    check: (r) => Array.isArray(r.questions) && r.questions.length === 0,
  },
  {
    description: 'Never asks more than 2 questions',
    input: 'I had something for lunch',
    check: (r) => Array.isArray(r.questions) && r.questions.length <= 2,
  },
  {
    description: 'Does NOT return totalNutrition (wrong step)',
    input: 'chicken sandwich with fries',
    check: (r) => r.totalNutrition === undefined,
  },
  {
    description: 'Returns correct ingredient shape',
    input: '2 scrambled eggs and a slice of whole wheat toast',
    check: (r) =>
      Array.isArray(r.ingredients) &&
      r.ingredients.length > 0 &&
      r.ingredients.every((i: any) =>
        typeof i.name === 'string' &&
        typeof i.servingAmount === 'number' &&
        typeof i.servingUnit === 'string' &&
        typeof i.servingSizeGrams === 'number' &&
        i.provenance?.source === 'llm_estimate'
      ),
  },
  {
    description: 'Name is max 40 characters',
    input: 'large pepperoni pizza with extra cheese and mushrooms and jalapeños',
    check: (r) => typeof r.name === 'string' && r.name.length <= 40,
  },
  {
    description: 'Does not re-ask questions already answered in conversation history',
    input: 'CONVERSATION HISTORY:\nUser: I had a burrito\nAssistant: Was it chicken or beef?\nUser: Chicken\n\nNew message: with rice and black beans',
    check: (r) => Array.isArray(r.questions) && r.questions.length === 0,
  },
  {
    description: 'Question options do not include catch-all like "Other"',
    input: 'I had a sandwich',
    check: (r) => {
      if (!r.questions?.length) return true; // no questions is fine
      return r.questions.every((q: any) =>
        !q.options?.some((o: string) => o.toLowerCase().startsWith('other'))
      );
    },
  },
];

runEvals('meal-summary', cases, (input) => mealSummaryService(input as string))
  .then((summary) => { if (summary.failures.length) process.exit(1); })
  .catch(console.error);
```

### `evals/cases/nutrition-analysis.eval.ts`

Tests the nutrition-analysis prompt, which is the final step — no questions, full nutrition breakdown.

```typescript
import { runEvals, EvalCase } from '../runner';
import { nutritionAnalysisService } from '../../src/services/nutritionAnalysisService'; // adjust to actual

const cases: EvalCase[] = [
  {
    description: 'Returns totalNutrition with required macro fields',
    input: '2 scrambled eggs and whole wheat toast',
    check: (r) => {
      const n = r.totalNutrition;
      return (
        n &&
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
    check: (r) => r.questions === undefined,
  },
  {
    description: 'Each ingredient has a nutrition object with calories',
    input: 'bowl of oatmeal with banana and honey',
    check: (r) =>
      Array.isArray(r.ingredients) &&
      r.ingredients.every((i: any) => typeof i.nutrition?.calories === 'number'),
  },
  {
    description: 'Calorie total is plausible (> 0 and < 5000)',
    input: 'cheeseburger with fries and a coke',
    check: (r) =>
      r.totalNutrition?.calories > 0 && r.totalNutrition?.calories < 5000,
  },
  {
    description: 'Ingredient calories sum is roughly consistent with totalNutrition calories (within 20%)',
    input: '2 eggs, 2 strips of bacon, and coffee with cream',
    check: (r) => {
      const total = r.totalNutrition?.calories;
      const sum = r.ingredients?.reduce((acc: number, i: any) => acc + (i.nutrition?.calories ?? 0), 0);
      if (!total || !sum) return false;
      return Math.abs(total - sum) / total < 0.2;
    },
  },
  {
    description: 'Name is max 40 characters',
    input: 'very large breakfast platter with eggs bacon sausage toast and home fries',
    check: (r) => typeof r.name === 'string' && r.name.length <= 40,
  },
];

runEvals('nutrition-analysis', cases, (input) => nutritionAnalysisService(input as string))
  .then((summary) => { if (summary.failures.length) process.exit(1); })
  .catch(console.error);
```

### `evals/cases/meal-planner-suggestions.eval.ts`

```typescript
import { runEvals, EvalCase } from '../runner';
import { mealPlannerSuggestionsService } from '../../src/services/mealPlannerService'; // adjust to actual

const baseInput = { profileContext: '', plannerContext: '', recipeContext: '' };

const cases: EvalCase[] = [
  {
    description: 'Returns 2-4 options',
    input: { ...baseInput, userPrompt: 'something high protein for dinner' },
    check: (r) => Array.isArray(r.options) && r.options.length >= 2 && r.options.length <= 4,
  },
  {
    description: 'Each option has required nutrition fields',
    input: { ...baseInput, userPrompt: 'quick lunch idea' },
    check: (r) =>
      r.options?.every((o: any) =>
        typeof o.nutrition?.calories === 'number' &&
        typeof o.nutrition?.protein === 'number' &&
        typeof o.nutrition?.carbohydrates === 'number' &&
        typeof o.nutrition?.fat === 'number'
      ),
  },
  {
    description: 'Does not invent recipe URLs when no recipeContext provided',
    input: { ...baseInput, userPrompt: 'healthy breakfast' },
    check: (r) =>
      r.options?.every((o: any) => !o.recipe?.canonicalUrl || o.recipe.canonicalUrl === ''),
  },
  {
    description: 'Each option has a mealType field',
    input: { ...baseInput, userPrompt: 'dinner suggestion' },
    check: (r) =>
      r.options?.every((o: any) =>
        ['breakfast', 'lunch', 'dinner', 'snack'].includes(o.mealType)
      ),
  },
];

runEvals('meal-planner-suggestions', cases, (input) => mealPlannerSuggestionsService(input))
  .then((summary) => { if (summary.failures.length) process.exit(1); })
  .catch(console.error);
```

### `evals/cases/activity-summary.eval.ts`

```typescript
import { runEvals, EvalCase } from '../runner';
import { activitySummaryService } from '../../src/services/activitySummaryService'; // adjust to actual

const cases: EvalCase[] = [
  {
    description: 'Returns empty questions array (never asks volume questions)',
    input: '3 mile run',
    check: (r) => Array.isArray(r.questions) && r.questions.length === 0,
  },
  {
    description: 'Cardio item has correct kind',
    input: '5k run this morning',
    check: (r) => r.items?.some((i: any) => i.kind === 'cardio'),
  },
  {
    description: 'Strength item has correct kind',
    input: 'bench press 3x10 at 135lbs',
    check: (r) => r.items?.some((i: any) => i.kind === 'strength'),
  },
  {
    description: 'Does NOT return calories or kcal fields',
    input: '30 minute bike ride',
    check: (r) =>
      r.totalCalories === undefined &&
      r.items?.every((i: any) => i.calories === undefined && i.kcal === undefined),
  },
  {
    description: 'Name is max 40 characters',
    input: 'long morning run followed by upper body weights and stretching',
    check: (r) => typeof r.name === 'string' && r.name.length <= 40,
  },
  {
    description: 'Strength sets use weightLbs not weightKg',
    input: 'squats 4x8 at 185 pounds',
    check: (r) => {
      const strengthItem = r.items?.find((i: any) => i.kind === 'strength');
      return strengthItem?.sets?.every((s: any) => s.weightKg === undefined);
    },
  },
];

runEvals('activity-summary', cases, (input) => activitySummaryService(input as string))
  .then((summary) => { if (summary.failures.length) process.exit(1); })
  .catch(console.error);
```

---

## 8. Package.json Scripts

Add to `nomlog-api/package.json`:

```json
"scripts": {
  "eval:meal-summary":             "ts-node evals/cases/meal-summary.eval.ts",
  "eval:nutrition-analysis":       "ts-node evals/cases/nutrition-analysis.eval.ts",
  "eval:meal-planner-suggestions": "ts-node evals/cases/meal-planner-suggestions.eval.ts",
  "eval:activity-summary":         "ts-node evals/cases/activity-summary.eval.ts",
  "eval:all":                      "ts-node evals/cases/meal-summary.eval.ts && ts-node evals/cases/nutrition-analysis.eval.ts && ts-node evals/cases/meal-planner-suggestions.eval.ts && ts-node evals/cases/activity-summary.eval.ts"
}
```

---

## 9. What NOT to Build Yet

- No CI integration — run evals manually before promoting a prompt version
- No LLM-as-judge evals — programmatic shape/value checks are enough for now
- No A/B testing or gradual rollout
- No prompt management UI
