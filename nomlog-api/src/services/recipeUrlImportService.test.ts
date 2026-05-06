import assert from 'node:assert/strict';
import test from 'node:test';

async function loadInternals() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

  const module = await import('./recipeUrlImportService');
  return module.recipeUrlImportServiceInternals;
}

test('extractFirstUrl finds the first URL in prompt', async () => {
  const internals = await loadInternals();
  assert.equal(
    internals.extractFirstUrl('Plan around this https://www.allrecipes.com/recipe/123/?utm_source=test please'),
    'https://www.allrecipes.com/recipe/123/?utm_source=test'
  );
  assert.equal(internals.extractFirstUrl('No url in this prompt'), null);
});

test('normalizeRecipeUrl removes tracking params and preserves original url', async () => {
  const internals = await loadInternals();
  const normalized = internals.normalizeRecipeUrl(
    'https://www.allrecipes.com/recipe/123/?utm_source=test&gclid=abc&keep=1#section'
  );

  assert.equal(
    normalized.originalUrl,
    'https://www.allrecipes.com/recipe/123/?utm_source=test&gclid=abc&keep=1#section'
  );
  assert.equal(normalized.canonicalUrl, 'https://www.allrecipes.com/recipe/123/?keep=1');
});

test('deriveSourceKey maps known hosts and falls back to user_import', async () => {
  const internals = await loadInternals();
  assert.equal(internals.deriveSourceKey('https://www.allrecipes.com/recipe/123/'), 'allrecipes');
  assert.equal(internals.deriveSourceKey('https://www.foodnetwork.com/recipes/foo'), 'foodnetwork');
  assert.equal(internals.deriveSourceKey('https://example.com/recipe/foo'), 'user_import');
});

test('parseRecipeFromHtml extracts recipe fields from json-ld', async () => {
  const internals = await loadInternals();
  const html = `
  <html>
    <head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Lemon Chicken",
        "description": "Quick lemon chicken with garlic and herbs.",
        "image": "https://cdn.example.com/lemon-chicken.jpg",
        "author": { "@type": "Person", "name": "Chef Test" },
        "recipeYield": "4 servings",
        "prepTime": "PT15M",
        "cookTime": "PT20M",
        "totalTime": "PT35M",
        "recipeCategory": ["Dinner"],
        "keywords": ["high protein", "easy"],
        "recipeIngredient": [
          "1 lb chicken breast",
          "2 tbsp olive oil"
        ],
        "recipeInstructions": [
          { "@type": "HowToStep", "text": "Season the chicken." },
          { "@type": "HowToStep", "text": "Cook until done." }
        ],
        "nutrition": {
          "@type": "NutritionInformation",
          "calories": "420 calories",
          "proteinContent": "38 g",
          "carbohydrateContent": "12 g",
          "fatContent": "22 g"
        }
      }
      </script>
    </head>
  </html>`;

  const parsed = internals.parseRecipeFromHtml(html, 'https://example.com/lemon-chicken');
  assert.ok(parsed);
  assert.equal(parsed?.title, 'Lemon Chicken');
  assert.equal(parsed?.mealTypes.includes('dinner'), true);
  assert.equal(parsed?.ingredients.length, 2);
  assert.equal(parsed?.instructions.length, 2);
  assert.equal(parsed?.nutrition?.protein, 38);
});
