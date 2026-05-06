/**
 * Pipeline Step 2: Enrich fetched recipes with full metadata via LLM.
 *
 * Reads manifest.json, processes entries with status "fetched",
 * reads <slug>.raw.json, calls the enrichment service, writes
 * full recipe to <slug>.json, and updates the manifest.
 *
 * Usage: yarn pipeline:enrich
 */
import fs from 'fs';
import path from 'path';
import { RecipeCurationService, ParsedRecipeDocument, CuratedRecipe } from '../../services/recipeCurationService';

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
};

function readManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('manifest.json not found at', MANIFEST_PATH);
    process.exitCode = 1;
    return [];
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as ManifestEntry[];
}

function writeManifest(entries: ManifestEntry[]): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

async function main(): Promise<void> {
  const manifest = readManifest();
  if (!manifest.length) return;

  const toEnrich = manifest.filter((e) => e.status === 'fetched');
  if (!toEnrich.length) {
    console.log(JSON.stringify({ ok: true, message: 'No fetched recipes to enrich', total: manifest.length }, null, 2));
    return;
  }

  const service = new RecipeCurationService();
  let enriched = 0;
  let failed = 0;

  for (const entry of toEnrich) {
    const rawPath = path.join(CURATED_DIR, `${entry.slug}.raw.json`);
    if (!fs.existsSync(rawPath)) {
      console.error(`  SKIP: ${entry.slug} — raw file not found at ${rawPath}`);
      entry.error = 'Raw file not found';
      failed++;
      writeManifest(manifest);
      continue;
    }

    console.log(`Enriching: ${entry.slug}`);
    try {
      const parsed: ParsedRecipeDocument = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
      const result: CuratedRecipe = await service.enrich(parsed, entry.url, {
        userId: null,
        route: 'pipeline/enrich-recipes',
      });

      const outPath = path.join(CURATED_DIR, `${entry.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

      entry.status = 'enriched';
      entry.enrichedAt = new Date().toISOString();
      delete entry.error;
      enriched++;

      console.log(`  OK: "${result.title}"`);
      console.log(`      cuisine=${result.cuisine}, difficulty=${result.difficulty}, cost=${result.estimatedCostTier}`);
      console.log(`      dietaryFlags=[${result.dietaryFlags.join(', ')}]`);
      console.log(`      calories=${result.nutrition?.calories ?? '?'}, protein=${result.nutrition?.protein ?? '?'}g`);
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      failed++;
      console.error(`  FAIL: ${entry.error}`);
    }

    writeManifest(manifest);
  }

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        enriched,
        failed,
        total: manifest.length,
      },
      null,
      2
    )
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Pipeline enrich failed:', error);
  process.exitCode = 1;
});
