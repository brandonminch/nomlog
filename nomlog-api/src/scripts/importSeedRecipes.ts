import { RecipeSeedService } from '../services/recipeSeedService';
import { SEED_RECIPE_CATALOG_VERSION, seedRecipes } from '../data/recipes/seedRecipes';

async function main(): Promise<void> {
  const service = new RecipeSeedService();
  const result = await service.importSeedRecipes();

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogVersion: SEED_RECIPE_CATALOG_VERSION,
        recipeCount: seedRecipes.length,
        importedCount: result.importedCount,
        recipeIds: result.recipeIds,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Failed to import seed recipes:', error);
  process.exitCode = 1;
});
