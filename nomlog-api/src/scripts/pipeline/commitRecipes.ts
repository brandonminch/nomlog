/**
 * Pipeline Step 4: Commit approved recipes to the database.
 *
 * Reads manifest.json, processes entries with status "approved",
 * validates against the CuratedRecipe schema, and upserts to Supabase.
 *
 * Usage:
 *   yarn pipeline:commit                    — commit approved recipes
 *   yarn pipeline:commit:develop            — commit to development database
 *   yarn pipeline:commit:develop --force    — re-upsert all committed recipes (for edits)
 *   yarn pipeline:commit:develop --force black-bean-chili salmon-teriyaki  — re-upsert specific slugs
 */
import fs from 'fs';
import path from 'path';
import { RecipeCurationService, CuratedRecipeSchema } from '../../services/recipeCurationService';

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

function cleanCommittedFiles(manifest: ManifestEntry[]): number {
  let cleaned = 0;
  for (const entry of manifest) {
    if (entry.status !== 'committed') continue;
    const jsonPath = path.join(CURATED_DIR, `${entry.slug}.json`);
    const rawPath = path.join(CURATED_DIR, `${entry.slug}.raw.json`);
    for (const p of [jsonPath, rawPath]) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        cleaned++;
      }
    }
  }
  return cleaned;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldClean = args.includes('--clean');
  const isForce = args.includes('--force');
  // Slugs after --force are treated as a filter, e.g. --force black-bean-chili salmon-teriyaki
  const forceSlugs = isForce
    ? args.slice(args.indexOf('--force') + 1).filter((a) => !a.startsWith('--'))
    : [];

  const manifest = readManifest();
  if (!manifest.length) return;

  const approved = isForce
    ? manifest.filter(
        (e) =>
          e.status === 'committed' &&
          (forceSlugs.length === 0 || forceSlugs.includes(e.slug)) &&
          fs.existsSync(path.join(CURATED_DIR, `${e.slug}.json`))
      )
    : manifest.filter((e) => e.status === 'approved');

  // If --clean with no approved recipes, just clean existing committed files
  if (!approved.length && shouldClean) {
    const cleaned = cleanCommittedFiles(manifest);
    writeManifest(manifest);
    console.log(JSON.stringify({ ok: true, message: 'No recipes to commit. Cleaned files.', cleaned, total: manifest.length }, null, 2));
    return;
  }

  if (!approved.length) {
    console.log(JSON.stringify({ ok: true, message: 'No approved recipes to commit', total: manifest.length }, null, 2));
    return;
  }

  const service = new RecipeCurationService();
  let committed = 0;
  let failed = 0;
  const committedIds: string[] = [];

  for (const entry of approved) {
    const recipePath = path.join(CURATED_DIR, `${entry.slug}.json`);
    if (!fs.existsSync(recipePath)) {
      console.error(`  SKIP: ${entry.slug} — enriched file not found`);
      entry.error = 'Enriched file not found';
      failed++;
      writeManifest(manifest);
      continue;
    }

    console.log(`Committing: ${entry.slug}`);
    try {
      const raw = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));

      // Validate against schema before committing
      const parsed = CuratedRecipeSchema.parse(raw);

      const stored = await service.commitToDatabase(parsed);

      entry.status = 'committed';
      entry.committedAt = new Date().toISOString();
      entry.committedId = stored.id;
      delete entry.error;
      committed++;
      committedIds.push(stored.id);
      console.log(`  OK: "${stored.title}" → id=${stored.id}`);
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      failed++;
      console.error(`  FAIL: ${entry.error}`);
    }

    writeManifest(manifest);
  }

  // Clean up local files after successful commit
  let cleaned = 0;
  if (shouldClean && failed === 0) {
    cleaned = cleanCommittedFiles(manifest);
    writeManifest(manifest);
    console.log(`Cleaned ${cleaned} local files.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        committed,
        failed,
        cleaned,
        total: manifest.length,
        committedIds,
      },
      null,
      2
    )
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Pipeline commit failed:', error);
  process.exitCode = 1;
});
