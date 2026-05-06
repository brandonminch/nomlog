import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useUserProfile } from './useUserProfile';
import { MealLog } from '../types/mealLog';

export interface DayStats {
  date: string;
  dayName: string; // Mon, Tue, etc.
  calories: number; // total calories for the day
  calorieGoal: number; // user's daily calorie goal
  proteinPercent: number; // percentage of calories from protein (0-100)
  carbsPercent: number; // percentage of calories from carbs (0-100)
  fatPercent: number; // percentage of calories from fat (0-100)
}

export interface WeeklyStats {
  days: DayStats[];
  averages: { protein: number; carbs: number; fat: number };
  isLoading: boolean;
  weekLabel: string; // e.g., "Dec 16 - Dec 22"
  weeklyTotals: {
    protein: number; // grams
    carbs: number; // grams
    fat: number; // grams
  };
  weeklyGoals: {
    protein: number; // grams
    carbs: number; // grams
    fat: number; // grams
  };
  dailyGoals: {
    protein: number; // grams per day
    carbs: number; // grams per day
    fat: number; // grams per day
  };
  daysForCalculation: number; // number of days used for calculation (7 for past weeks, days elapsed for current week)
  deviationPercent: {
    protein: number; // percentage deviation from goal (-100 to +100)
    carbs: number;
    fat: number;
  };
}

// Helper to format date as YYYY-MM-DD
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get Monday of a given date's week
export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  return d;
};

// Get array of 7 dates starting from Monday
const getWeekDates = (weekStart: Date): Date[] => {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Day name abbreviations
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const useWeeklyStats = (weekStartDate: Date): WeeklyStats => {
  const { token } = useAuthStore();
  const { data: profile } = useUserProfile();
  
  const weekDates = getWeekDates(weekStartDate);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Calculate date range for the week
  const weekStartStr = formatDateString(weekDates[0]);
  const weekEndStr = formatDateString(weekDates[6]);
  
  // Debug: log the week dates being queried
  console.log('[useWeeklyStats] Week dates:', weekDates.map(d => formatDateString(d)));
  console.log('[useWeeklyStats] Fetching logs for range:', weekStartStr, 'to', weekEndStr);
  
  // Fetch entire week in a single query using the new endpoint format
  const { data: weekData, isLoading } = useQuery({
    queryKey: ['weeklyLogs', weekStartStr, weekEndStr],
    queryFn: async () => {
      const data = await apiClient.get(
        `/api/v1/logs?dateStart=${weekStartStr}&dateEnd=${weekEndStr}&timezone=${encodeURIComponent(timezone)}`
      );
      // New endpoint returns: Record<string, { meals: MealLog[]; water: { glasses: number } }>
      return data as Record<
        string,
        { meals: MealLog[]; water: { glasses: number }; activities?: unknown[] }
      >;
    },
    enabled: !!token,
    staleTime: 30 * 1000,
  });
  
  // Debug: log profile goals
  console.log('[useWeeklyStats] Profile goals:', {
    protein: profile?.daily_protein_goal,
    carb: profile?.daily_carb_goal,
    fat: profile?.daily_fat_goal,
  });
  
  // Get calorie goal from profile (default to 2000 if not set)
  const calorieGoal = profile?.daily_calorie_goal || 2000;
  
  // Calculate stats for each day
  const days: DayStats[] = weekDates.map((date, index) => {
    const dateString = formatDateString(date);
    // Extract meals for this day from the week data
    const dayData = weekData?.[dateString];
    const logs = dayData?.meals || [];
    
    // Sum up nutrition for the day
    const dailyTotals = logs.reduce(
      (totals, log) => {
        if (log?.status === 'planned') return totals;
        const nutrition = log.total_nutrition;
        return {
          calories: totals.calories + (nutrition?.calories || 0),
          protein: totals.protein + (nutrition?.protein || 0),
          carbs: totals.carbs + (nutrition?.carbohydrates || 0),
          fat: totals.fat + (nutrition?.fat || 0),
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    
    // Calculate macro percentages as percentage of calories
    // Protein: 4 cal/g, Carbs: 4 cal/g, Fat: 9 cal/g
    const proteinCalories = dailyTotals.protein * 4;
    const carbsCalories = dailyTotals.carbs * 4;
    const fatCalories = dailyTotals.fat * 9;
    const totalCalories = dailyTotals.calories || 0;
    
    // Calculate percentages (avoid division by zero)
    const proteinPercent = totalCalories > 0 ? (proteinCalories / totalCalories) * 100 : 0;
    const carbsPercent = totalCalories > 0 ? (carbsCalories / totalCalories) * 100 : 0;
    const fatPercent = totalCalories > 0 ? (fatCalories / totalCalories) * 100 : 0;
    
    const dayStats: DayStats = {
      date: formatDateString(date),
      dayName: DAY_NAMES[index],
      calories: totalCalories,
      calorieGoal,
      proteinPercent,
      carbsPercent,
      fatPercent,
    };
    
    // Debug: log day stats
    if (totalCalories > 0) {
      console.log(`[useWeeklyStats] ${dayStats.dayName} calories: ${totalCalories.toFixed(0)}, macro %:`, {
        protein: proteinPercent.toFixed(1),
        carbs: carbsPercent.toFixed(1),
        fat: fatPercent.toFixed(1),
      });
    }
    
    return dayStats;
  });
  
  // Calculate weekly averages (only for days with data)
  const daysWithData = days.filter(d => d.calories > 0);
  const divisor = daysWithData.length || 1; // Avoid division by zero
  
  const averages = {
    protein: daysWithData.reduce((sum, d) => sum + d.proteinPercent, 0) / divisor,
    carbs: daysWithData.reduce((sum, d) => sum + d.carbsPercent, 0) / divisor,
    fat: daysWithData.reduce((sum, d) => sum + d.fatPercent, 0) / divisor,
  };
  
  // Calculate weekly totals (sum of grams across all days)
  // We need to recalculate from the raw data since DayStats only has percentages
  const weeklyTotals = days.reduce(
    (totals, day) => {
      const dateString = day.date;
      const dayData = weekData?.[dateString];
      const logs = dayData?.meals || [];
      
      const dayTotals = logs.reduce(
        (daySum, log) => {
          if (log?.status === 'planned') return daySum;
          const nutrition = log.total_nutrition;
          return {
            protein: daySum.protein + (nutrition?.protein || 0),
            carbs: daySum.carbs + (nutrition?.carbohydrates || 0),
            fat: daySum.fat + (nutrition?.fat || 0),
          };
        },
        { protein: 0, carbs: 0, fat: 0 }
      );
      
      return {
        protein: totals.protein + dayTotals.protein,
        carbs: totals.carbs + dayTotals.carbs,
        fat: totals.fat + dayTotals.fat,
      };
    },
    { protein: 0, carbs: 0, fat: 0 }
  );
  
  // Determine if this is the current week
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const isCurrentWeek = weekStartDate.getTime() === currentWeekStart.getTime();
  
  // Calculate days elapsed for current week (including today)
  // For past weeks, always use 7 days
  const daysElapsed = isCurrentWeek
    ? Math.min(7, Math.floor((today.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 7;
  
  // Calculate weekly goals based on days elapsed
  const daysForGoal = daysElapsed;
  const weeklyGoals = {
    protein: (profile?.daily_protein_goal || 0) * daysForGoal,
    carbs: (profile?.daily_carb_goal || 0) * daysForGoal,
    fat: (profile?.daily_fat_goal || 0) * daysForGoal,
  };
  
  // Daily goals (for display)
  const dailyGoals = {
    protein: profile?.daily_protein_goal || 0,
    carbs: profile?.daily_carb_goal || 0,
    fat: profile?.daily_fat_goal || 0,
  };
  
  // Calculate percentage deviation from goal
  const calculateDeviation = (current: number, goal: number): number => {
    if (goal <= 0) return 0;
    const deviation = ((current - goal) / goal) * 100;
    return Math.max(-100, Math.min(100, deviation));
  };
  
  const deviationPercent = {
    protein: calculateDeviation(weeklyTotals.protein, weeklyGoals.protein),
    carbs: calculateDeviation(weeklyTotals.carbs, weeklyGoals.carbs),
    fat: calculateDeviation(weeklyTotals.fat, weeklyGoals.fat),
  };
  
  // Format week label (e.g., "Dec 16 - Dec 22")
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekStartDate.getDate() + 6);
  
  const formatShortDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const weekLabel = `${formatShortDate(weekStartDate)} - ${formatShortDate(weekEnd)}`;
  
  return {
    days,
    averages,
    isLoading,
    weekLabel,
    weeklyTotals,
    weeklyGoals,
    dailyGoals,
    daysForCalculation: daysElapsed,
    deviationPercent,
  };
};







