import assert from 'node:assert/strict';
import test from 'node:test';
import { seedRecipes, SEED_RECIPE_CATALOG_VERSION } from './seedRecipes';

test('seed recipe catalog is versioned and non-empty', () => {
  assert.equal(SEED_RECIPE_CATALOG_VERSION, 3);
  assert.ok(seedRecipes.length >= 6);
});

test('seed recipes have unique slugs and canonical URLs', () => {
  const slugs = new Set<string>();
  const canonicalUrls = new Set<string>();

  for (const recipe of seedRecipes) {
    assert.ok(!slugs.has(recipe.slug));
    assert.ok(!canonicalUrls.has(recipe.canonicalUrl));
    slugs.add(recipe.slug);
    canonicalUrls.add(recipe.canonicalUrl);
  }
});

test('seed recipes include structured serving and ingredient metadata', () => {
  for (const recipe of seedRecipes) {
    assert.ok(recipe.servings > 0);
    assert.ok(recipe.servingUnit.length > 0);
    assert.ok(recipe.mealTypes.length > 0);
    assert.ok(recipe.ingredients.length > 0);

    for (const ingredient of recipe.ingredients) {
      assert.ok(ingredient.text.length > 0);
      assert.ok((ingredient.name || '').length > 0);
    }
  }
});
