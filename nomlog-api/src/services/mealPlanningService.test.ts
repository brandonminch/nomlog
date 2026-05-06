import assert from 'node:assert/strict';
import test from 'node:test';

async function loadService() {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

  return import('./mealPlanningService');
}

test('suggestMeals returns catalog expansion message when matches are weak', async () => {
  const { MealPlanningService } = await loadService();
  const service = new MealPlanningService() as any;

  service.recipeSourceService = {
    searchRecipeMatches: async () => [
      {
        recipe: {
          id: '11111111-1111-4111-8111-111111111111',
          sourceKey: 'internal',
          sourceName: 'Nomlog',
          canonicalUrl: 'https://recipes.nomlog.local/chicken-bowl',
          title: 'Sheet Pan Chicken Bowl',
          summary: 'Roasted chicken bowl.',
          yieldText: '2 bowls',
          mealTypes: ['dinner'],
          ingredientNames: ['chicken breast'],
          ingredients: [{ text: '1 lb chicken breast', name: 'chicken breast', amount: 1, unit: 'pound' }],
          instructions: [{ text: 'Roast and serve.', position: 1 }],
          nutrition: { protein: 35, calories: 500, carbohydrates: 24, fat: 18 },
          tags: ['high-protein'],
          fetchedAt: new Date().toISOString(),
        },
        score: 2,
        quality: 'weak',
        matchedTerms: [],
        unmetTerms: ['berries'],
      },
    ],
  };

  const result = await service.suggestMeals({
    prompt: 'I want something with berries',
    profile: null,
    mealType: 'dinner',
    userId: '00000000-0000-0000-0000-000000000001',
  });

  assert.equal(result.options.length, 0);
  assert.match(result.personalizationNote, /don't have a close recipe match/i);
});

test('suggestMeals uses exact stored recipe titles for grounded cards', async () => {
  const { MealPlanningService } = await loadService();
  const service = new MealPlanningService() as any;

  service.recipeSourceService = {
    searchRecipeMatches: async () => [
      {
        recipe: {
          id: '22222222-2222-4222-8222-222222222222',
          sourceKey: 'internal',
          sourceName: 'Nomlog',
          canonicalUrl: 'https://recipes.nomlog.local/salmon-bowl',
          title: 'Salmon Rice Bowls',
          summary: 'Weeknight salmon bowls with rice and cucumbers.',
          yieldText: '2 bowls',
          mealTypes: ['dinner'],
          ingredientNames: ['salmon fillet', 'rice', 'cucumber'],
          ingredients: [{ text: '12 ounces salmon fillet', name: 'salmon fillet', amount: 12, unit: 'ounce' }],
          instructions: [{ text: 'Cook and assemble.', position: 1 }],
          nutrition: { protein: 39, calories: 560, carbohydrates: 45, fat: 23 },
          tags: ['high-protein', '30-minute'],
          fetchedAt: new Date().toISOString(),
        },
        score: 16,
        quality: 'strong',
        matchedTerms: ['salmon'],
        unmetTerms: [],
      },
    ],
  };

  const result = await service.suggestMeals({
    prompt: 'I want salmon tonight',
    profile: null,
    mealType: 'dinner',
    userId: '00000000-0000-0000-0000-000000000001',
  });

  assert.equal(result.options.length, 1);
  assert.equal(result.options[0]?.name, 'Salmon Rice Bowls');
  assert.equal(result.options[0]?.recipe?.recipeId, '22222222-2222-4222-8222-222222222222');
});
