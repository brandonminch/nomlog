/**
 * Pipeline Step 1: Fetch and parse recipes from URLs in manifest.json.
 *
 * Reads manifest.json, processes entries with status "pending",
 * writes parsed recipe data to <slug>.raw.json, and updates the manifest.
 *
 * Usage (from monorepo root):
 *   pnpm --filter nomlog-api run pipeline:fetch                — fetch all pending recipes
 *   pnpm --filter nomlog-api run pipeline:fetch -- --retry-failed — also retry entries that previously failed
 */
import fs from 'fs';
import path from 'path';
import { RecipeCurationService, ParsedRecipeDocument } from '../../services/recipeCurationService';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const manifest = readManifest();
  if (!manifest.length) return;

  const args = process.argv.slice(2);
  const retryFailed = args.includes('--retry-failed');

  // By default, skip entries that already have an error (previously failed).
  // --retry-failed clears their errors so they get re-attempted.
  if (retryFailed) {
    for (const entry of manifest) {
      if (entry.status === 'pending' && entry.error) {
        console.log(`Retrying previously failed: ${entry.slug}`);
        delete entry.error;
      }
    }
    writeManifest(manifest);
  }

  const pending = manifest.filter((e) => (!e.status || e.status === 'pending') && !e.error);
  if (!pending.length) {
    console.log(JSON.stringify({ ok: true, message: 'No pending recipes to fetch', total: manifest.length }, null, 2));
    return;
  }

  const service = new RecipeCurationService();
  let fetched = 0;
  let failed = 0;

  for (const entry of pending) {
    console.log(`Fetching: ${entry.slug} (${entry.url})`);
    try {
      const parsed: ParsedRecipeDocument = await service.fetchAndParse(entry.url);
      const outPath = path.join(CURATED_DIR, `${entry.slug}.raw.json`);
      fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');

      entry.status = 'fetched';
      entry.fetchedAt = new Date().toISOString();
      delete entry.error;
      fetched++;
      console.log(`  OK: "${parsed.title}" — ${parsed.ingredients.length} ingredients, ${parsed.instructions.length} steps`);
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      failed++;
      console.error(`  FAIL: ${entry.error}`);
    }

    writeManifest(manifest);

    // Polite 1s delay between fetches
    if (pending.indexOf(entry) < pending.length - 1) {
      await sleep(1000);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        fetched,
        failed,
        total: manifest.length,
        remaining: manifest.filter((e) => e.status === 'pending').length,
      },
      null,
      2
    )
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Pipeline fetch failed:', error);
  process.exitCode = 1;
});
