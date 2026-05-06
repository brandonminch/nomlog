import { NutritionData } from './nutrition';

export interface MealLog {
  id: string;
  user_id: string;
  name: string | null;
  description: string;
  total_nutrition: NutritionData['totalNutrition'] | null;
  ingredients: NutritionData['ingredients'] | null;
  created_at: string;
  updated_at: string;
  logged_at?: string;
  status?: 'logged' | 'planned';
  planned_for?: string | null;
  analysis_status?: 'pending' | 'analyzing' | 'completed' | 'failed' | 'failed_max_retries';
  original_description?: string;
  /** Supabase Storage object paths for attached meal photos, if present. */
  photo_storage_paths?: string[] | null;
  retry_count?: number;
  icon?: string;
  meal_type?: string;
  /** When true, final nutrition analysis must not replace `name`. */
  lock_meal_display_name?: boolean;
} 