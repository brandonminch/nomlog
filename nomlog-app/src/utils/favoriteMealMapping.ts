import type { MealLog } from '../types/mealLog';

export type FavoriteDetailPayload = {
  id: string;
  meal_id: string;
  name: string | null;
  description: string | null;
  total_nutrition: MealLog['total_nutrition'];
  ingredients: MealLog['ingredients'];
  icon?: string;
  analysis_status?: MealLog['analysis_status'];
  photo_storage_paths?: string[] | null;
  updated_at?: string;
};

export function favoriteToMealLog(fav: FavoriteDetailPayload): MealLog {
  const stamp = fav.updated_at ?? new Date().toISOString();
  const paths = (fav.photo_storage_paths ?? []).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return {
    id: fav.id,
    name: fav.name,
    description: fav.description ?? '',
    total_nutrition: fav.total_nutrition ?? null,
    ingredients: fav.ingredients ?? null,
    created_at: stamp,
    updated_at: stamp,
    photo_storage_paths: paths.length > 0 ? paths : undefined,
    icon: fav.icon,
    favorite_id: fav.id,
    analysis_status: fav.analysis_status,
  };
}
