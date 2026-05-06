export interface Nutrition {
  calories: number;
  fat: number;
  protein: number;
  carbohydrates: number;
  fiber: number;
  sugar: number;
  sodium: number;
  saturatedFat: number;
  potassium: number;
  cholesterol: number;
  calcium: number;
  iron: number;
  vitaminA: number;
  vitaminC: number;
  vitaminD: number;
  magnesium: number;
}

export interface MealLog {
  id: string;
  name: string | null;
  description: string;
  total_nutrition: Nutrition | null;
  ingredients: {
    name: string;
    servingAmount: number;
    servingUnit: string;
    servingSizeGrams: number;
    nutrition: Nutrition;
  }[] | null;
  created_at: string;
  updated_at: string;
  logged_at?: string;
  status?: 'logged' | 'planned';
  planned_for?: string | null;
  meal_type?: string; // Optional meal type field
  analysis_status?: 'pending' | 'analyzing' | 'completed' | 'failed' | 'failed_max_retries';
  original_description?: string;
  retry_count?: number;
  icon?: string;
  favorite_id?: string | null;
  recipe_id?: string | null;
  /** Supabase Storage object paths for attached meal photos, if present. */
  photo_storage_paths?: string[] | null;
} 