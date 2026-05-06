/**
 * Pipeline Step 3: Review, approve, or reject enriched recipes.
 *
 * Usage (from monorepo root):
 *   pnpm --filter nomlog-api run pipeline:review                         — print summary table
 *   pnpm --filter nomlog-api run pipeline:review -- --detail <slug>          — pretty-print full recipe JSON
 *   pnpm --filter nomlog-api run pipeline:review -- --approve <slug> [...]   — approve specific recipes
 *   pnpm --filter nomlog-api run pipeline:review -- --approve-all            — approve all enriched recipes
 *   pnpm --filter nomlog-api run pipeline:review -- --reject <slug> [...]    — reject specific recipes
 */
import fs from 'fs';
import path from 'path';
import { CuratedRecipeSchema } from '../../services/recipeCurationService';

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

function printSummaryTable(manifest: ManifestEntry[]): void {
  // Group by status
  const grouped = new Map<string, ManifestEntry[]>();
  for (const entry of manifest) {
    const group = grouped.get(entry.status) || [];
    group.push(entry);
    grouped.set(entry.status, group);
  }

  const statusOrder = ['pending', 'fetched', 'enriched', 'approved', 'rejected', 'committed'];

  console.log('\n=== Recipe Pipeline Status ===\n');
  console.log(`Total recipes: ${manifest.length}`);
  for (const status of statusOrder) {
    const count = grouped.get(status)?.length || 0;
    if (count > 0) console.log(`  ${status}: ${count}`);
  }
  console.log('');

  // Detailed view for enriched recipes
  const enriched = grouped.get('enriched') || [];
  if (enriched.length) {
    console.log('--- Enriched (ready for review) ---\n');
    for (const entry of enriched) {
      const recipePath = path.join(CURATED_DIR, `${entry.slug}.json`);
      if (!fs.existsSync(recipePath)) {
        console.log(`  ${entry.slug}: [recipe file missing]`);
        continue;
      }
      try {
        const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));
        const cal = recipe.nutrition?.calories ?? '?';
        const pro = recipe.nutrition?.protein ?? '?';
        console.log(`  ${entry.slug}`);
        console.log(`    Title:    ${recipe.title}`);
        console.log(`    Cuisine:  ${recipe.cuisine || '—'}  |  Difficulty: ${recipe.difficulty || '—'}  |  Cost: ${recipe.estimatedCostTier || '—'}`);
        console.log(`    Meals:    ${(recipe.mealTypes || []).join(', ')}`);
        console.log(`    Dietary:  ${(recipe.dietaryFlags || []).join(', ') || '—'}`);
        console.log(`    Calories: ${cal}  |  Protein: ${pro}g`);
        console.log('');
      } catch {
        console.log(`  ${entry.slug}: [error reading recipe file]`);
      }
    }
  }

  // Show approved recipes
  const approved = grouped.get('approved') || [];
  if (approved.length) {
    console.log('--- Approved (ready to commit) ---\n');
    for (const entry of approved) {
      console.log(`  ${entry.slug} — approved ${entry.approvedAt || ''}`);
    }
    console.log('');
  }

  // Show errors
  const withErrors = manifest.filter((e) => e.error);
  if (withErrors.length) {
    console.log('--- Errors ---\n');
    for (const entry of withErrors) {
      console.log(`  ${entry.slug} (${entry.status}): ${entry.error}`);
    }
    console.log('');
  }
}

function printDetail(manifest: ManifestEntry[], slug: string): void {
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) {
    console.error(`Recipe "${slug}" not found in manifest`);
    process.exitCode = 1;
    return;
  }

  console.log('\n--- Manifest Entry ---');
  console.log(JSON.stringify(entry, null, 2));

  // Try enriched file first, then raw
  const enrichedPath = path.join(CURATED_DIR, `${slug}.json`);
  const rawPath = path.join(CURATED_DIR, `${slug}.raw.json`);

  if (fs.existsSync(enrichedPath)) {
    console.log('\n--- Enriched Recipe ---');
    const recipe = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
    console.log(JSON.stringify(recipe, null, 2));

    // Validate against schema
    const result = CuratedRecipeSchema.safeParse(recipe);
    if (result.success) {
      console.log('\n[Schema validation: PASS]');
    } else {
      console.log('\n[Schema validation: FAIL]');
      console.log(JSON.stringify(result.error.issues, null, 2));
    }
  } else if (fs.existsSync(rawPath)) {
    console.log('\n--- Raw Parsed Recipe ---');
    console.log(JSON.stringify(JSON.parse(fs.readFileSync(rawPath, 'utf-8')), null, 2));
  } else {
    console.log('\n[No recipe files found]');
  }
}

function approveRecipes(manifest: ManifestEntry[], slugs: string[]): void {
  let approved = 0;
  for (const slug of slugs) {
    const entry = manifest.find((e) => e.slug === slug);
    if (!entry) {
      console.error(`  "${slug}" not found in manifest`);
      continue;
    }
    if (entry.status !== 'enriched') {
      console.warn(`  "${slug}" is ${entry.status}, not enriched — skipping`);
      continue;
    }
    entry.status = 'approved';
    entry.approvedAt = new Date().toISOString();
    approved++;
    console.log(`  Approved: ${slug}`);
  }
  writeManifest(manifest);
  console.log(`\n${approved} recipe(s) approved.`);
}

function rejectRecipes(manifest: ManifestEntry[], slugs: string[]): void {
  let rejected = 0;
  for (const slug of slugs) {
    const entry = manifest.find((e) => e.slug === slug);
    if (!entry) {
      console.error(`  "${slug}" not found in manifest`);
      continue;
    }
    if (entry.status !== 'enriched') {
      console.warn(`  "${slug}" is ${entry.status}, not enriched — skipping`);
      continue;
    }
    entry.status = 'rejected';
    rejected++;
    console.log(`  Rejected: ${slug}`);
  }
  writeManifest(manifest);
  console.log(`\n${rejected} recipe(s) rejected.`);
}

async function main(): Promise<void> {
  const manifest = readManifest();
  if (!manifest.length) return;

  const args = process.argv.slice(2);

  if (args.includes('--detail')) {
    const idx = args.indexOf('--detail');
    const slug = args[idx + 1];
    if (!slug) {
      console.error('--detail requires a slug argument');
      process.exitCode = 1;
      return;
    }
    printDetail(manifest, slug);
    return;
  }

  if (args.includes('--approve-all')) {
    const enriched = manifest.filter((e) => e.status === 'enriched').map((e) => e.slug);
    if (!enriched.length) {
      console.log('No enriched recipes to approve.');
      return;
    }
    approveRecipes(manifest, enriched);
    return;
  }

  if (args.includes('--approve')) {
    const idx = args.indexOf('--approve');
    const slugs = args.slice(idx + 1).filter((s) => !s.startsWith('--'));
    if (!slugs.length) {
      console.error('--approve requires at least one slug');
      process.exitCode = 1;
      return;
    }
    approveRecipes(manifest, slugs);
    return;
  }

  if (args.includes('--reject')) {
    const idx = args.indexOf('--reject');
    const slugs = args.slice(idx + 1).filter((s) => !s.startsWith('--'));
    if (!slugs.length) {
      console.error('--reject requires at least one slug');
      process.exitCode = 1;
      return;
    }
    rejectRecipes(manifest, slugs);
    return;
  }

  // Default: print summary
  printSummaryTable(manifest);
}

main().catch((error) => {
  console.error('Pipeline review failed:', error);
  process.exitCode = 1;
});
