import { supabaseAdmin } from '../config/supabase';
import { NutritionService } from './nutritionService';
import { EmbeddingService } from './embeddingService';
import { IconSelectionService } from './iconSelectionService';
import { NutritionData } from '../types/nutrition';

export class RetryAnalysisService {
  private nutritionService: NutritionService;
  private embeddingService: EmbeddingService;
  private iconSelectionService: IconSelectionService;

  constructor() {
    this.nutritionService = new NutritionService();
    this.embeddingService = new EmbeddingService();
    this.iconSelectionService = new IconSelectionService();
  }

  /**
   * Retry nutrition analysis for meal logs with failed status
   * Only retries logs that have been retried fewer than 3 times
   * @param limit Optional limit on number of failed analyses to retry per run (default: no limit)
   * @param maxRetries Maximum number of retry attempts before marking as failed_max_retries (default: 3)
   * @returns Statistics about the retry operation
   */
  public async run(limit?: number, maxRetries: number = 3): Promise<{ retried: number; succeeded: number; failed: number; checked: number; maxedOut: number }> {
    // Fetch meal logs with failed analysis status that haven't exceeded max retries
    // Exclude logs that are already marked as failed_max_retries
    let query = supabaseAdmin
      .from('meal_logs')
      .select('id, user_id, original_description, description, name, retry_count')
      .eq('analysis_status', 'failed')
      .lt('retry_count', maxRetries)
      .order('created_at', { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data: failedLogs, error } = await query;

    if (error) {
      throw error;
    }

    if (!failedLogs || failedLogs.length === 0) {
      return { retried: 0, succeeded: 0, failed: 0, checked: 0, maxedOut: 0 };
    }

    let succeededCount = 0;
    let failedCount = 0;
    let maxedOutCount = 0;
    const checkedCount = failedLogs.length;

    console.log(`Found ${checkedCount} meal log(s) with failed analysis (retry_count < ${maxRetries}). Retrying...`);

    for (const log of failedLogs) {
      const mealLogId = log.id;
      const currentRetries = log.retry_count ?? 0;
      const nextRetryCount = currentRetries + 1;
      
      // Use original_description if available, otherwise fall back to description
      const description = log.original_description || log.description || '';

      if (!description) {
        console.error(`Meal log ${mealLogId} has no description to analyze. Marking as failed_max_retries.`);
        // Mark as failed_max_retries since we can't retry without a description
        await supabaseAdmin
          .from('meal_logs')
          .update({ 
            analysis_status: 'failed_max_retries',
            retry_count: nextRetryCount
          })
          .eq('id', mealLogId);
        maxedOutCount++;
        continue;
      }

      try {
        console.log(`Retrying analysis for meal log ${mealLogId} (attempt ${nextRetryCount}/${maxRetries})...`);
        
        // Set status to analyzing and increment retry_count
        await supabaseAdmin
          .from('meal_logs')
          .update({ 
            analysis_status: 'analyzing',
            retry_count: nextRetryCount
          })
          .eq('id', mealLogId);

        // Run nutrition analysis (simple path without mealSummary since we're retrying)
        const ownerUserId = (log as { user_id: string }).user_id;
        const nutritionData: NutritionData = await this.nutritionService.analyzeMeal(description, {
          userId: ownerUserId,
          route: 'job/retry-failed-analysis',
        });

        // Select icon for the meal (don't let icon selection failure block nutrition update)
        let icon = 'utensils'; // Default fallback
        try {
          icon = await this.iconSelectionService.selectIcon(nutritionData.name, nutritionData.description, {
            userId: ownerUserId,
            route: 'job/retry-failed-analysis',
          });
        } catch (iconError) {
          console.error('[RetryAnalysisService] Icon selection failed, using default:', iconError);
          // Continue with default icon - don't fail the entire analysis
        }

        // Update meal log with full nutrition results and icon
        const { error: updateError } = await supabaseAdmin
          .from('meal_logs')
          .update({
            name: nutritionData.name,
            description: nutritionData.description,
            total_nutrition: nutritionData.totalNutrition,
            ingredients: nutritionData.ingredients || [],
            icon: icon,
            analysis_status: 'completed'
          })
          .eq('id', mealLogId);

        if (updateError) {
          throw updateError;
        }

        // Generate and store embedding asynchronously (fire-and-forget)
        setImmediate(async () => {
          try {
            await this.processEmbeddingGenerationAsync(
              mealLogId,
              nutritionData.name,
              nutritionData.description,
              log.original_description || null
            );
          } catch (err) {
            console.error(`Failed to generate embedding for meal log ${mealLogId}:`, err);
            // Don't fail the whole operation if embedding generation fails
          }
        });

        console.log(`✓ Successfully retried analysis for meal log ${mealLogId}`);
        succeededCount++;
      } catch (error) {
        console.error(`✗ Failed to retry analysis for meal log ${mealLogId} (attempt ${nextRetryCount}/${maxRetries}):`, error);
        
        // Check if we've reached max retries
        if (nextRetryCount >= maxRetries) {
          // Mark as failed_max_retries since we've exceeded max retries
          await supabaseAdmin
            .from('meal_logs')
            .update({ 
              analysis_status: 'failed_max_retries',
              retry_count: nextRetryCount
            })
            .eq('id', mealLogId);
          console.log(`  → Marked meal log ${mealLogId} as failed_max_retries after ${nextRetryCount} attempts`);
          maxedOutCount++;
        } else {
          // Mark as failed again, but keep retry_count so it can be retried later
          await supabaseAdmin
            .from('meal_logs')
            .update({ 
              analysis_status: 'failed',
              retry_count: nextRetryCount
            })
            .eq('id', mealLogId);
          failedCount++;
        }
      }
    }

    return {
      retried: checkedCount,
      succeeded: succeededCount,
      failed: failedCount,
      checked: checkedCount,
      maxedOut: maxedOutCount
    };
  }

  /**
   * Async function to generate and store embedding for a meal log
   */
  private async processEmbeddingGenerationAsync(
    mealLogId: string,
    name: string | null,
    description: string | null,
    originalDescription: string | null
  ): Promise<void> {
    try {
      // Check if embedding already exists (idempotent)
      const { data: existing } = await supabaseAdmin
        .from('meal_log_embeddings')
        .select('meal_log_id')
        .eq('meal_log_id', mealLogId)
        .maybeSingle();

      if (existing) {
        console.log(`Embedding already exists for meal log ${mealLogId}, skipping`);
        return;
      }

      // Generate embedding using the service's method
      const embedding = await this.embeddingService.generateEmbedding(
        name,
        description,
        originalDescription
      );

      // Store embedding in database (Supabase JS client accepts array directly for vector types)
      const { error } = await supabaseAdmin
        .from('meal_log_embeddings')
        .insert({
          meal_log_id: mealLogId,
          embedding: embedding,
        });

      if (error) {
        console.error('Error storing embedding:', error);
        throw error;
      }

      console.log(`Successfully generated and stored embedding for meal log ${mealLogId}`);
    } catch (error) {
      console.error(`Async embedding generation failed for meal log ${mealLogId}:`, error);
      // Don't throw - embedding generation failure shouldn't fail the whole operation
    }
  }
}

