import assert from 'node:assert/strict';
import test from 'node:test';
import { StoredRecipe } from '../types/recipe';

/** Default values for fields added in P0/P1/P2 schema enrichment. */
const RECIPE_DEFAULTS = {
  dietaryFlags: [] as StoredRecipe['dietaryFlags'],
  allergens: [] as StoredRecipe['allergens'],
  cuisine: null,
  difficulty: null,
  categories: [] as StoredRecipe['categories'],
  estimatedCostTier: null,
  equipmentNeeded: [] as StoredRecipe['equipmentNeeded'],
} satisfies Partial<StoredRecipe>;

async function loadInternals() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

  const module = await import('./recipeSourceService');
  return module.recipeSourceServiceInternals;
}

test('extractMaxMinutesFromText handles common quick-meal phrasing', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    assert.equal(recipeSourceServiceInternals.extractMaxMinutesFromText('high protein dinner under 30 minutes'), 30);
    assert.equal(recipeSourceServiceInternals.extractMaxMinutesFromText('lunch in 20 min'), 20);
    assert.equal(recipeSourceServiceInternals.extractMaxMinutesFromText('breakfast ideas'), undefined);
  });
});

test('parseRecipeQuery extracts ingredient and nutrition intent from freeform prompts', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const chickenQuery = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'I want chicken tonight',
      maxResults: 8,
    });
    assert.equal(chickenQuery.mealType, undefined);
    assert.equal(chickenQuery.wantsHighProtein, false);
    assert.deepEqual(chickenQuery.desiredTerms, ['chicken']);

    const berryQuery = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'I want something with berries',
      maxResults: 8,
    });
    assert.equal(berryQuery.desiredTerms.includes('berries'), true);
    assert.equal(berryQuery.desiredTerms.includes('with'), false);

    const proteinQuery = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'Give me some high protein ideas',
      maxResults: 8,
    });
    assert.equal(proteinQuery.wantsHighProtein, true);
    assert.deepEqual(proteinQuery.desiredTerms, []);
  });
});

test('buildRecipeSearchMatch ranks chicken prompts above unrelated recipes', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const chickenRecipe: StoredRecipe = {
      ...RECIPE_DEFAULTS,
      id: '11111111-1111-4111-8111-111111111111',
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      canonicalUrl: 'https://recipes.nomlog.local/chicken-bowl',
      title: 'Sheet Pan Chicken Bowl',
      summary: 'Roasted chicken with vegetables.',
      yieldText: '2 bowls',
      mealTypes: ['dinner'],
      ingredientNames: ['chicken breast', 'broccoli', 'sweet potato'],
      ingredients: [{ text: '1 lb chicken breast', name: 'chicken breast', amount: 1, unit: 'pound' }],
      instructions: [{ text: 'Roast and serve.', position: 1 }],
      nutrition: { protein: 38, calories: 500, carbohydrates: 25, fat: 18 },
      tags: ['high-protein', 'dinner'],
      fetchedAt: new Date().toISOString(),
    };

    const berryRecipe: StoredRecipe = {
      ...chickenRecipe,
      id: '22222222-2222-4222-8222-222222222222',
      canonicalUrl: 'https://recipes.nomlog.local/berry-bowl',
      title: 'Berry Yogurt Bowl',
      summary: 'Greek yogurt with berries.',
      mealTypes: ['breakfast'],
      ingredientNames: ['greek yogurt', 'berries'],
      ingredients: [{ text: '1 cup berries', name: 'berries', amount: 1, unit: 'cup' }],
      nutrition: { protein: 20, calories: 320, carbohydrates: 30, fat: 8 },
      tags: ['breakfast'],
    };

    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'I want chicken tonight',
      mealType: 'dinner',
      maxResults: 8,
    });
    const chickenMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(chickenRecipe, query);
    const berryMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(berryRecipe, query);

    assert.equal(chickenMatch.quality === 'strong' || chickenMatch.quality === 'medium', true);
    assert.equal(berryMatch.quality, 'weak');
    assert.equal(chickenMatch.score > berryMatch.score, true);
  });
});

test('parseRecipeQuery extracts macro caps for low carb/calories/fat', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'Lunch ideas that are low carb under 50g carbs and under 500 calories and low fat',
      mealType: undefined,
      maxResults: 8,
    });

    assert.equal(query.mealType, 'lunch');
    assert.equal(query.wantsLowCarb, true);
    assert.equal(query.maxCarbs, 50);
    assert.equal(query.wantsLowCalories, true);
    assert.equal(query.maxCalories, 500);
    assert.equal(query.wantsLowFat, true);
  });
});

test('buildRecipeSearchMatch scores low carb without desiredTerms', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const lowCarbRecipe: StoredRecipe = {
      ...RECIPE_DEFAULTS,
      id: '11111111-1111-4111-8111-111111111111',
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      canonicalUrl: 'https://recipes.nomlog.local/low-carb',
      title: 'Low carb bowl',
      summary: 'Protein forward and low carb.',
      yieldText: '1 bowl',
      mealTypes: ['dinner'],
      ingredientNames: ['chicken breast'],
      ingredients: [{ text: '1 lb chicken breast', name: 'chicken breast', amount: 1, unit: 'pound' }],
      instructions: [{ text: 'Cook and serve.', position: 1 }],
      nutrition: { protein: 40, calories: 450, carbohydrates: 25, fat: 18 },
      tags: ['dinner', 'low-carb'],
      fetchedAt: new Date().toISOString(),
    };

    const highCarbRecipe: StoredRecipe = {
      ...lowCarbRecipe,
      id: '22222222-2222-4222-8222-222222222222',
      canonicalUrl: 'https://recipes.nomlog.local/high-carb',
      title: 'High carb bowl',
      summary: 'Carb heavy and not ideal for low carb.',
      nutrition: { protein: 40, calories: 520, carbohydrates: 90, fat: 10 },
      tags: ['dinner', 'high-carb'],
    };

    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'low carb dinner',
      maxResults: 8,
    });

    assert.deepEqual(query.desiredTerms, []);

    const lowCarbMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(lowCarbRecipe, query);
    const highCarbMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(highCarbRecipe, query);

    assert.notEqual(lowCarbMatch.quality, 'weak');
    assert.equal(highCarbMatch.quality, 'weak');
  });
});

test('buildRecipeSearchMatch scores calorie caps without desiredTerms', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const under500Recipe: StoredRecipe = {
      ...RECIPE_DEFAULTS,
      id: '33333333-3333-4333-8333-333333333333',
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      canonicalUrl: 'https://recipes.nomlog.local/under-500',
      title: 'Under 500 calories',
      summary: 'A lighter meal.',
      yieldText: '1 serving',
      mealTypes: ['lunch'],
      ingredientNames: ['salad', 'chicken'],
      ingredients: [{ text: 'chicken salad', name: 'salad', amount: 1, unit: 'serving' }],
      instructions: [{ text: 'Mix and serve.', position: 1 }],
      nutrition: { protein: 35, calories: 450, carbohydrates: 20, fat: 12 },
      tags: ['lunch'],
      fetchedAt: new Date().toISOString(),
    };

    const over500Recipe: StoredRecipe = {
      ...under500Recipe,
      id: '44444444-4444-4444-8444-444444444444',
      canonicalUrl: 'https://recipes.nomlog.local/over-500',
      title: 'Over 500 calories',
      nutrition: { protein: 35, calories: 650, carbohydrates: 45, fat: 20 },
      tags: ['lunch'],
    };

    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'under 500 calories lunch',
      maxResults: 8,
    });

    assert.deepEqual(query.desiredTerms, []);

    const under500Match = recipeSourceServiceInternals.buildRecipeSearchMatch(under500Recipe, query);
    const over500Match = recipeSourceServiceInternals.buildRecipeSearchMatch(over500Recipe, query);

    assert.notEqual(under500Match.quality, 'weak');
    assert.equal(over500Match.quality, 'weak');
  });
});

test('buildRecipeSearchMatch scores low fat without desiredTerms', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const lowFatRecipe: StoredRecipe = {
      ...RECIPE_DEFAULTS,
      id: '55555555-5555-4555-8555-555555555555',
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      canonicalUrl: 'https://recipes.nomlog.local/low-fat',
      title: 'Low fat bowl',
      summary: 'Lean and low fat.',
      yieldText: '1 bowl',
      mealTypes: ['dinner'],
      ingredientNames: ['turkey'],
      ingredients: [{ text: '1 lb turkey', name: 'turkey', amount: 1, unit: 'pound' }],
      instructions: [{ text: 'Cook and serve.', position: 1 }],
      nutrition: { protein: 45, calories: 420, carbohydrates: 30, fat: 12 },
      tags: ['dinner'],
      fetchedAt: new Date().toISOString(),
    };

    const highFatRecipe: StoredRecipe = {
      ...lowFatRecipe,
      id: '66666666-6666-4666-8666-666666666666',
      canonicalUrl: 'https://recipes.nomlog.local/high-fat',
      title: 'High fat bowl',
      nutrition: { protein: 45, calories: 700, carbohydrates: 35, fat: 40 },
    };

    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'low fat dinner',
      maxResults: 8,
    });

    assert.deepEqual(query.desiredTerms, []);

    const lowFatMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(lowFatRecipe, query);
    const highFatMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(highFatRecipe, query);

    assert.notEqual(lowFatMatch.quality, 'weak');
    assert.equal(highFatMatch.quality, 'weak');
  });
});

test('buildRecipeSearchMatch scores keto-like prompts without desiredTerms', () => {
  return loadInternals().then((recipeSourceServiceInternals) => {
    const ketoRecipe: StoredRecipe = {
      ...RECIPE_DEFAULTS,
      id: '77777777-7777-4777-8777-777777777777',
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      canonicalUrl: 'https://recipes.nomlog.local/keto',
      title: 'Keto bowl',
      summary: 'Keto-ish macros.',
      yieldText: '1 bowl',
      mealTypes: ['dinner'],
      ingredientNames: ['eggs'],
      ingredients: [{ text: 'eggs', name: 'eggs', amount: 1, unit: 'serving' }],
      instructions: [{ text: 'Cook and serve.', position: 1 }],
      nutrition: { protein: 35, calories: 500, carbohydrates: 30, fat: 25 },
      tags: ['dinner', 'keto'],
      fetchedAt: new Date().toISOString(),
    };

    const nonKetoRecipe: StoredRecipe = {
      ...ketoRecipe,
      id: '88888888-8888-4888-8888-888888888888',
      canonicalUrl: 'https://recipes.nomlog.local/not-keto',
      title: 'Not keto bowl',
      nutrition: { protein: 35, calories: 650, carbohydrates: 110, fat: 8 },
      tags: ['dinner'],
    };

    const query = recipeSourceServiceInternals.parseRecipeQuery({
      prompt: 'keto dinner',
      maxResults: 8,
    });

    assert.deepEqual(query.desiredTerms, []);
    assert.equal(query.ketoLike, true);

    const ketoMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(ketoRecipe, query);
    const nonKetoMatch = recipeSourceServiceInternals.buildRecipeSearchMatch(nonKetoRecipe, query);

    assert.notEqual(ketoMatch.quality, 'weak');
    assert.equal(nonKetoMatch.quality, 'weak');
  });
});
