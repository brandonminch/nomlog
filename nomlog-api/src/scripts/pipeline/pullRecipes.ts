/**
 * Pipeline Step 0: Pull committed recipes from the database to local JSON files.
 *
 * Fetches all internal recipes from Supabase and writes them to
 * src/data/recipes/curated/<slug>.json, then updates manifest.json so the
 * commit step can re-upsert edits back to the database.
 *
 * Usage:
 *   yarn pipeline:pull           — pull all internal recipes
 *   yarn pipeline:pull:develop   — pull from development database
 *   yarn pipeline:pull --source-key internal  — filter by source key (default: internal)
 */
import fs from 'fs';
import path from 'path';
import { RecipeRepository } from '../../services/recipeRepository';
import type { StoredRecipe } from '../../types/recipe';

const CURATED_DIR = path.resolve(__dirname, '../../data/recipes/curated');
const MANIFEST_PATH = path.join(CURATED_DIR, 'manifest.json');

type ManifestEntry = {
  url: string;
  slug: string;
  status: 'pending' | 'fetched' | 'enriched' | 'approved' | 'rejected' | 'committed';
  targetMealTypes?: string[];
  targetCuisine?: string;
  notes?: string;
  error?: string;
  fetchedAt?: string;
  enrichedAt?: string;
  approvedAt?: string;
  committedAt?: string;
  committedId?: string;
};

function readManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as ManifestEntry[];
  } catch {
    return [];
  }
}

function writeManifest(entries: ManifestEntry[]): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

/**
 * Maps a StoredRecipe (DB row) back to the CuratedRecipe JSON shape used by the pipeline.
 */
function storedToCurated(recipe: StoredRecipe, slug: string): Record<string, unknown> {
  return {
    slug,
    sourceUrl: recipe.originalUrl ?? null,
    title: recipe.title,
    summary: recipe.summary ?? '',
    imageUrl: recipe.imageUrl ?? null,
    authorName: recipe.authorName ?? null,
    servings: recipe.servings ?? 1,
    servingUnit: recipe.servingUnit ?? 'serving',
    yieldText: recipe.yieldText ?? null,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    mealTypes: recipe.mealTypes ?? [],
    tags: recipe.tags ?? [],
    searchAliases: [],
    ingredients: recipe.ingredients ?? [],
    instructions: recipe.instructions ?? [],
    nutrition: recipe.nutrition ?? null,
    dietaryFlags: recipe.dietaryFlags ?? [],
    allergens: recipe.allergens ?? [],
    cuisine: recipe.cuisine ?? null,
    difficulty: recipe.difficulty ?? null,
    categories: recipe.categories ?? [],
    estimatedCostTier: recipe.estimatedCostTier ?? null,
    equipmentNeeded: recipe.equipmentNeeded ?? [],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceKeyArg = args.find((a) => a.startsWith('--source-key='))?.split('=')[1];
  const sourceKey = sourceKeyArg ?? 'internal';

  if (!fs.existsSync(CURATED_DIR)) {
    fs.mkdirSync(CURATED_DIR, { recursive: true });
  }

  const repo = new RecipeRepository();
  console.log(`Pulling recipes (source_key=${sourceKey}) from database...`);

  const recipes = await repo.listAll({ sourceKey, limit: 1000 });

  if (!recipes.length) {
    console.log(JSON.stringify({ ok: true, message: 'No recipes found in database', pulled: 0 }, null, 2));
    return;
  }

  const manifest = readManifest();
  const manifestBySlug = new Map<string, ManifestEntry>(manifest.map((e) => [e.slug, e]));

  let pulled = 0;
  let updated = 0;

  for (const recipe of recipes) {
    const slug = recipe.slug;
    const curated = storedToCurated(recipe, slug);
    const recipePath = path.join(CURATED_DIR, `${slug}.json`);

    // Write the JSON file
    fs.writeFileSync(recipePath, JSON.stringify(curated, null, 2) + '\n', 'utf-8');

    // Update or create manifest entry
    const existing = manifestBySlug.get(slug);
    if (existing) {
      existing.status = 'committed';
      existing.committedId = recipe.id;
      updated++;
    } else {
      const newEntry: ManifestEntry = {
        url: recipe.originalUrl ?? '',
        slug,
        status: 'committed',
        targetMealTypes: recipe.mealTypes,
        targetCuisine: recipe.cuisine ?? undefined,
        committedId: recipe.id,
        committedAt: recipe.fetchedAt,
      };
      manifestBySlug.set(slug, newEntry);
      pulled++;
    }

    console.log(`  OK: "${recipe.title}" → ${slug}.json`);
  }

  writeManifest(Array.from(manifestBySlug.values()));

  console.log(
    JSON.stringify(
      {
        ok: true,
        pulled: pulled + updated,
        new: pulled,
        updated,
        total: recipes.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Pipeline pull failed:', error);
  process.exitCode = 1;
});
