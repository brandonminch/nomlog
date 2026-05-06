import { seedRecipes } from '../data/recipes/seedRecipes';
import { RecipeRepository } from './recipeRepository';

export class RecipeSeedService {
  constructor(private repository: RecipeRepository = new RecipeRepository()) {}

  async importSeedRecipes(): Promise<{ importedCount: number; recipeIds: string[] }> {
    const imported = [];

    for (const recipe of seedRecipes) {
      const stored = await this.repository.upsert({
        sourceKey: 'internal',
        sourceName: 'Nomlog',
        slug: recipe.slug,
        title: recipe.title,
        summary: recipe.summary,
        yieldText: recipe.yieldText,
        servings: recipe.servings,
        servingUnit: recipe.servingUnit,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        totalTimeMinutes: recipe.totalTimeMinutes,
        mealTypes: recipe.mealTypes,
        ingredientNames: [
          ...recipe.ingredients.map((ingredient) => ingredient.name || ''),
          ...recipe.searchAliases,
        ],
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        nutrition: recipe.nutrition,
        tags: recipe.tags,
        dietaryFlags: recipe.dietaryFlags,
        allergens: recipe.allergens,
        cuisine: recipe.cuisine,
        difficulty: recipe.difficulty,
        categories: recipe.categories,
        estimatedCostTier: recipe.estimatedCostTier,
        equipmentNeeded: recipe.equipmentNeeded,
      });
      imported.push(stored);
    }

    return {
      importedCount: imported.length,
      recipeIds: imported.map((recipe) => recipe.id),
    };
  }
}
