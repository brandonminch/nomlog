import { supabaseAdmin } from '../config/supabase';
import { NutritionData } from '../types/nutrition';
import { MealLog } from '../types/mealLog';

export class MealLogService {
  async createMealLog(userId: string, description: string, nutritionData: NutritionData): Promise<MealLog> {
    console.log('createMealLog - Original user description:', description);
    console.log('createMealLog - Nutrition data name:', nutritionData.name);
    console.log('createMealLog - Nutrition data description:', nutritionData.description);
    
    // Ensure meal name is under 40 characters
    const truncatedName = nutritionData.name.length > 40 
      ? nutritionData.name.substring(0, 37) + '...' 
      : nutritionData.name;

    console.log('createMealLog - Truncated name:', truncatedName);
    console.log('createMealLog - Storing description:', nutritionData.description);

    const { data, error } = await supabaseAdmin
      .from('meal_logs')
      .insert({
        user_id: userId,
        name: truncatedName,
        description: nutritionData.description, // Use LLM-generated description
        total_nutrition: nutritionData.totalNutrition,
        ingredients: nutritionData.ingredients,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating meal log:', error);
      throw new Error('Failed to create meal log');
    }

    console.log('createMealLog - Created meal log:', JSON.stringify(data, null, 2));
    return data;
  }

  async getMealLogs(userId: string): Promise<MealLog[]> {
    const { data, error } = await supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching meal logs:', error);
      throw new Error('Failed to fetch meal logs');
    }

    return data;
  }

  async getTodaysMealLogs(userId: string, _timezone: string = 'UTC'): Promise<MealLog[]> {
    // Calculate start and end of today in the user's timezone
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    
    // Convert to UTC for database query
    const startOfTodayUTC = new Date(startOfToday.getTime() - (startOfToday.getTimezoneOffset() * 60000));
    const endOfTodayUTC = new Date(endOfToday.getTime() - (endOfToday.getTimezoneOffset() * 60000));

    const { data, error } = await supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfTodayUTC.toISOString())
      .lt('created_at', endOfTodayUTC.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching today\'s meal logs:', error);
      throw new Error('Failed to fetch today\'s meal logs');
    }

    return data;
  }

  async getMealLog(userId: string, mealLogId: string): Promise<MealLog> {
    const { data, error } = await supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('id', mealLogId)
      .single();

    if (error) {
      console.error('Error fetching meal log:', error);
      throw new Error('Failed to fetch meal log');
    }

    return data;
  }

  async deleteMealLog(userId: string, mealLogId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('meal_logs')
      .delete()
      .eq('user_id', userId)
      .eq('id', mealLogId);

    if (error) {
      console.error('Error deleting meal log:', error);
      throw new Error('Failed to delete meal log');
    }
  }
} 