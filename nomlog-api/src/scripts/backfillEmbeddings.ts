/**
 * Backfill script to generate embeddings for existing meal logs
 * 
 * Usage (from monorepo root):
 *   pnpm --filter nomlog-api exec ts-node src/scripts/backfillEmbeddings.ts
 *   pnpm --filter nomlog-api exec ts-node src/scripts/backfillEmbeddings.ts -- --dry-run
 *   pnpm --filter nomlog-api exec ts-node src/scripts/backfillEmbeddings.ts -- --batch-size 50
 */

import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();

import { supabaseAdmin } from '../config/supabase';
import { EmbeddingService } from '../services/embeddingService';

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE_ARG = process.argv.find(arg => arg.startsWith('--batch-size='));
const CUSTOM_BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split('=')[1], 10) : null;
const ACTUAL_BATCH_SIZE = CUSTOM_BATCH_SIZE || BATCH_SIZE;

interface MealLogForEmbedding {
  id: string;
  name: string | null;
  description: string | null;
  original_description: string | null;
}

async function backfillEmbeddings() {
  console.log('Starting embedding backfill...');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Batch size: ${ACTUAL_BATCH_SIZE}`);

  const embeddingService = new EmbeddingService();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get all meal logs that don't have embeddings
    let offset = 0;
    let hasMore = true;

    // First, get all existing embedding IDs once
    const { data: existingEmbeddings } = await supabaseAdmin
      .from('meal_log_embeddings')
      .select('meal_log_id');

    const existingIds = new Set((existingEmbeddings || []).map((e: any) => e.meal_log_id));
    console.log(`Found ${existingIds.size} existing embeddings`);

    while (hasMore) {
      // Fetch meal logs in batches
      const { data: allMealLogs, error: fetchError } = await supabaseAdmin
        .from('meal_logs')
        .select('id, name, description, original_description')
        .order('created_at', { ascending: true })
        .range(offset, offset + ACTUAL_BATCH_SIZE - 1);

      if (fetchError) {
        throw fetchError;
      }

      if (!allMealLogs || allMealLogs.length === 0) {
        hasMore = false;
        break;
      }

      // Filter out meal logs that already have embeddings
      const mealLogs = (allMealLogs || []).filter(
        (log: MealLogForEmbedding) => !existingIds.has(log.id)
      ) as MealLogForEmbedding[];

        if (mealLogs.length === 0) {
          hasMore = false;
          break;
        }

        // Process this batch
        for (const mealLog of mealLogs) {
          processed++;
          console.log(`[${processed}] Processing meal log ${mealLog.id}...`);

          try {
            // Check if embedding already exists (double-check)
            const { data: existing } = await supabaseAdmin
              .from('meal_log_embeddings')
              .select('meal_log_id')
              .eq('meal_log_id', mealLog.id)
              .single();

            if (existing) {
              console.log(`  Skipping - embedding already exists`);
              skipped++;
              continue;
            }

            if (DRY_RUN) {
              console.log(`  [DRY RUN] Would generate embedding for: ${mealLog.name || 'Unnamed'}`);
              succeeded++;
            } else {
              // Generate embedding
              const embedding = await embeddingService.generateEmbedding(
                mealLog.name,
                mealLog.description,
                mealLog.original_description
              );

              // Store embedding
              const { error: insertError } = await supabaseAdmin
                .from('meal_log_embeddings')
                .insert({
                  meal_log_id: mealLog.id,
                  embedding: embedding,
                });

              if (insertError) {
                throw insertError;
              }

              console.log(`  ✓ Successfully generated and stored embedding`);
              succeeded++;
            }
          } catch (error) {
            console.error(`  ✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            failed++;
          }
        }

      // Process this batch
      for (const mealLog of mealLogs) {
        processed++;
        console.log(`[${processed}] Processing meal log ${mealLog.id}...`);

        try {
          // Check if embedding already exists (double-check)
          const { data: existing } = await supabaseAdmin
            .from('meal_log_embeddings')
            .select('meal_log_id')
            .eq('meal_log_id', mealLog.id)
            .single();

          if (existing) {
            console.log(`  Skipping - embedding already exists`);
            skipped++;
            continue;
          }

          if (DRY_RUN) {
            console.log(`  [DRY RUN] Would generate embedding for: ${mealLog.name || 'Unnamed'}`);
            succeeded++;
          } else {
            // Generate embedding
            const embedding = await embeddingService.generateEmbedding(
              mealLog.name,
              mealLog.description,
              mealLog.original_description
            );

            // Store embedding
            const { error: insertError } = await supabaseAdmin
              .from('meal_log_embeddings')
              .insert({
                meal_log_id: mealLog.id,
                embedding: embedding,
              });

            if (insertError) {
              throw insertError;
            }

            console.log(`  ✓ Successfully generated and stored embedding`);
            succeeded++;
          }
        } catch (error) {
          console.error(`  ✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          failed++;
        }
      }

      if (allMealLogs.length < ACTUAL_BATCH_SIZE) {
        hasMore = false;
      } else {
        offset += ACTUAL_BATCH_SIZE;
      }

      // Small delay between batches to avoid rate limiting
      if (hasMore && !DRY_RUN) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n=== Backfill Complete ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped (already exists): ${skipped}`);

    if (DRY_RUN) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to actually generate embeddings.');
    }
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillEmbeddings()
  .then(() => {
    console.log('Backfill script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Backfill script failed:', error);
    process.exit(1);
  });

