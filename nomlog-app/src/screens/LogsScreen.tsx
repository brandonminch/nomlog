import React, { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  RefreshControl,
  AppState,
  TouchableOpacity,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Modal,
  ListRenderItemInfo,
  Platform,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditTimeModal } from '../components/EditTimeModal';
import { MacroProgressCard } from '../components/MacroProgressCard';
import { WaterTracker } from '../components/WaterTracker';
import { ActivityGroupCard } from '../components/ActivityGroupCard';
import { MealGroupCard } from '../components/MealGroupCard';
import { WeekCalendarNav } from '../components/WeekCalendarNav';
import { Dumbbell, Wheat, Droplet, Calendar as CalendarIcon } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import { MealLog } from '../types/mealLog';
import type { ActivityLog } from '../types/activityLog';
import { ensureActivityHealthKit } from '../lib/healthkit';
import { useUserProfile, type UserProfile } from '../hooks/useUserProfile';
import { useLogsRange } from '../hooks/useLogsRange';
import type { MealTypeTag } from '../utils/mealLogContext';
import { LottieLoadingSpinner } from '../components/LottieLoadingSpinner';

type LogsRangeDayData = { meals: any[]; water: { glasses: number }; activities: ActivityLog[] };
type LogsRangeMap = Record<string, LogsRangeDayData>;

// Helper function to format date as YYYY-MM-DD in local timezone
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper functions for week calculations (Sunday-based weeks)
const startOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

const getMealBucket = (log: any): 'breakfast' | 'lunch' | 'dinner' | 'snack' => {
  const explicitType = (log.meal_type as string | undefined)?.toLowerCase();
  if (explicitType === 'breakfast' || explicitType === 'lunch' || explicitType === 'dinner' || explicitType === 'snack') {
    return explicitType;
  }

  const dateToUse =
    log?.status === 'planned' ? log.planned_for || log.created_at : log.logged_at || log.created_at;
  const hour = new Date(dateToUse).getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 21) return 'dinner';
  return 'snack';
};

// Header with its own display index so we can update it during swipe without re-rendering the carousel (avoids macro bar flash).
type DaysDataItem = { date: Date; dateString: string };
type HeaderHandle = { setDisplayIndex: (index: number) => void };

const LogsScreenHeader = React.forwardRef<
  HeaderHandle,
  {
    daysData: DaysDataItem[];
    displayIndex: number;
    getDayDataFromRangeCache: (dateString: string) => { meals: any[] } | null;
    formatDate: (date: Date) => string;
    topInset: number;
    onLayout?: (event: any) => void;
    onDatePress?: (date: Date) => void;
    calorieGoal: number | null | undefined;
  }
>((props, ref) => {
  const {
    daysData,
    displayIndex: carouselIndexSync,
    getDayDataFromRangeCache,
    formatDate,
    topInset,
    onLayout,
    onDatePress,
    calorieGoal,
  } = props;
  const [displayIndex, setDisplayIndex] = useState(() => Math.max(0, daysData.length - 1));

  useImperativeHandle(ref, () => ({ setDisplayIndex }), []);

  useEffect(() => {
    setDisplayIndex(carouselIndexSync);
  }, [carouselIndexSync]);

  const { headerTotalCalories, headerPlannedCalories } = React.useMemo(() => {
    const currentDateString = daysData[displayIndex]?.dateString;
    const currentDayData = currentDateString ? getDayDataFromRangeCache(currentDateString) : null;
    const currentDayLogs = currentDayData?.meals;
    const { logged, planned } =
      currentDayLogs?.reduce(
        (acc: { logged: number; planned: number }, log: any) => {
          const c = log?.total_nutrition?.calories || 0;
          if (log?.status === 'planned') {
            acc.planned += c;
          } else {
            acc.logged += c;
          }
          return acc;
        },
        { logged: 0, planned: 0 }
      ) ?? { logged: 0, planned: 0 };
    return {
      headerTotalCalories: logged,
      headerPlannedCalories: planned,
    };
  }, [daysData, displayIndex, getDayDataFromRangeCache]);

  return (
    <View style={[styles.staticHeader, { top: topInset }]} onLayout={onLayout}>
      <View style={styles.headerLeft}>
        <Text style={styles.screenTitle}>Logs</Text>
        <TouchableOpacity
          style={styles.dateContainer}
          activeOpacity={0.7}
          onPress={() => {
            const current = daysData[displayIndex];
            if (current && onDatePress) {
              onDatePress(current.date);
            }
          }}
        >
          <CalendarIcon size={16} color="#4a5565" />
          <Text style={styles.dateText}>
            {daysData[displayIndex] ? formatDate(daysData[displayIndex].date) : ''}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.headerRight}>
        <View style={styles.headerCaloriesBlock}>
          <View style={styles.headerCaloriesTotalRow}>
            <Text style={styles.dailyCalories}>{Math.round(headerTotalCalories)}</Text>
            {calorieGoal != null && calorieGoal > 0 ? (
              <Text style={styles.dailyCaloriesGoalSuffix}> / {Math.round(calorieGoal)}</Text>
            ) : null}
          </View>
          <View style={styles.dailyCaloriesLabelRow}>
            {headerPlannedCalories > 0 ? (
              <>
                <Text style={styles.dailyCaloriesPlanned}>
                  +{Math.round(headerPlannedCalories)} planned
                </Text>
                <Text style={styles.dailyCaloriesLabel}> calories</Text>
              </>
            ) : (
              <Text style={styles.dailyCaloriesLabel}>calories</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});
LogsScreenHeader.displayName = 'LogsScreenHeader';

type LogsDayContentProps = {
  dayData: DaysDataItem;
  isActive: boolean;
  token: string | null | undefined;
  insets: { bottom: number };
  profile: UserProfile | undefined;
  rangeData: LogsRangeMap | undefined;
  isRangeLoading: boolean;
  onLogMealPress: (dateString?: string, mealType?: MealTypeTag) => void;
  onMealPress: (mealType: MealTypeTag) => void;
  onActivityLogPress: () => void;
  onActivityGroupPress: (dateString: string) => void;
  onActivityItemPress: (log: ActivityLog) => void;
};

const LogsDayContent = React.memo(function LogsDayContent({
  dayData,
  isActive,
  token,
  insets,
  profile,
  rangeData,
  isRangeLoading,
  onLogMealPress,
  onMealPress,
  onActivityLogPress,
  onActivityGroupPress,
  onActivityItemPress,
}: LogsDayContentProps) {
  const [isManualRefresh, setIsManualRefresh] = React.useState(false);
  const queryClient = useQueryClient();

  const dayDataFromCache = React.useMemo(() => {
    if (!rangeData) return null;
    const d = rangeData[dayData.dateString];
    if (d) return d;
    return { meals: [], water: { glasses: 0 }, activities: [] };
  }, [rangeData, dayData.dateString]);

  const dayActivities: ActivityLog[] = dayDataFromCache?.activities ?? [];

  const logs = dayDataFromCache?.meals;
  const isLoading = isRangeLoading;

  const onRefresh = React.useCallback(async () => {
    setIsManualRefresh(true);
    await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
    setIsManualRefresh(false);
  }, [queryClient]);

  const dailyTotals =
    logs?.reduce(
      (totals: any, log: any) => {
        if (log?.status === 'planned') return totals;
        const nutrition = log.total_nutrition;
        return {
          calories: totals.calories + (nutrition?.calories || 0),
          protein: totals.protein + (nutrition?.protein || 0),
          carbohydrates: totals.carbohydrates + (nutrition?.carbohydrates || 0),
          fat: totals.fat + (nutrition?.fat || 0),
        };
      },
      { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
    ) || { calories: 0, protein: 0, carbohydrates: 0, fat: 0 };

  const plannedDailyTotals =
    logs?.reduce(
      (totals: { protein: number; carbohydrates: number; fat: number }, log: any) => {
        if (log?.status !== 'planned') return totals;
        const nutrition = log.total_nutrition;
        return {
          protein: totals.protein + (nutrition?.protein || 0),
          carbohydrates: totals.carbohydrates + (nutrition?.carbohydrates || 0),
          fat: totals.fat + (nutrition?.fat || 0),
        };
      },
      { protein: 0, carbohydrates: 0, fat: 0 }
    ) || { protein: 0, carbohydrates: 0, fat: 0 };

  const mealGroups = React.useMemo(() => {
    const initial = {
      breakfast: {
        count: 0,
        plannedCount: 0,
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0,
        plannedCalories: 0,
        plannedProtein: 0,
        plannedCarbohydrates: 0,
        plannedFat: 0,
        firstLog: null as any | null,
        isAnalyzing: false,
        items: [] as { title: string; icon?: string }[],
        plannedItems: [] as { title: string; icon?: string }[],
      },
      lunch: {
        count: 0,
        plannedCount: 0,
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0,
        plannedCalories: 0,
        plannedProtein: 0,
        plannedCarbohydrates: 0,
        plannedFat: 0,
        firstLog: null as any | null,
        isAnalyzing: false,
        items: [] as { title: string; icon?: string }[],
        plannedItems: [] as { title: string; icon?: string }[],
      },
      dinner: {
        count: 0,
        plannedCount: 0,
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0,
        plannedCalories: 0,
        plannedProtein: 0,
        plannedCarbohydrates: 0,
        plannedFat: 0,
        firstLog: null as any | null,
        isAnalyzing: false,
        items: [] as { title: string; icon?: string }[],
        plannedItems: [] as { title: string; icon?: string }[],
      },
      snack: {
        count: 0,
        plannedCount: 0,
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0,
        plannedCalories: 0,
        plannedProtein: 0,
        plannedCarbohydrates: 0,
        plannedFat: 0,
        firstLog: null as any | null,
        isAnalyzing: false,
        items: [] as { title: string; icon?: string }[],
        plannedItems: [] as { title: string; icon?: string }[],
      },
    };

    if (!logs || logs.length === 0) {
      return initial;
    }

    for (const log of logs) {
      const bucket = getMealBucket(log);
      const nutrition = log.total_nutrition;
      const group = initial[bucket];
      const isPlanned = log?.status === 'planned';
      if (isPlanned) {
        group.plannedCount += 1;
      } else {
        group.count += 1;
      }
      if (!group.firstLog) {
        group.firstLog = log;
      }
      const title =
        (log.name && log.name.trim()) ||
        (log.description && log.description.trim()) ||
        (log.original_description && log.original_description.trim());
      if (title && !isPlanned) {
        group.items.push({ title, icon: log.icon });
      }
      if (title && isPlanned) {
        group.plannedItems.push({ title, icon: log.icon });
      }
      if (log.analysis_status === 'pending' || log.analysis_status === 'analyzing') {
        group.isAnalyzing = true;
      }
      if (nutrition && !isPlanned) {
        group.calories += nutrition.calories || 0;
        group.protein += nutrition.protein || 0;
        group.carbohydrates += nutrition.carbohydrates || 0;
        group.fat += nutrition.fat || 0;
      }
      if (nutrition && isPlanned) {
        group.plannedCalories += nutrition.calories || 0;
        group.plannedProtein += nutrition.protein || 0;
        group.plannedCarbohydrates += nutrition.carbohydrates || 0;
        group.plannedFat += nutrition.fat || 0;
      }
    }

    return initial;
  }, [logs]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <LottieLoadingSpinner width={140} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={{ paddingTop: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isManualRefresh}
          onRefresh={onRefresh}
          tintColor="#007AFF"
          colors={['#007AFF']}
        />
      }
    >
      <View style={styles.summaryContainer}>
        <MacroProgressCard
          current={dailyTotals.protein}
          goal={profile?.daily_protein_goal || null}
          planned={plannedDailyTotals.protein}
          isActive={isActive}
          label="Protein"
          icon={Dumbbell}
          iconColor="#dc2626"
          backgroundColor="#ffe2e2"
          progressColor="#dc2626"
        />
        <MacroProgressCard
          current={dailyTotals.carbohydrates}
          goal={profile?.daily_carb_goal || null}
          planned={plannedDailyTotals.carbohydrates}
          isActive={isActive}
          label="Carbs"
          icon={Wheat}
          iconColor="#ca8a04"
          backgroundColor="#fef9c2"
          progressColor="#ca8a04"
        />
        <MacroProgressCard
          current={dailyTotals.fat}
          goal={profile?.daily_fat_goal || null}
          planned={plannedDailyTotals.fat}
          isActive={isActive}
          label="Fat"
          icon={Droplet}
          iconColor="#9810fa"
          backgroundColor="#e9d5ff"
          progressColor="#9810fa"
        />
      </View>

      <WaterTracker dateString={dayData.dateString} />

      <View style={styles.divider} />

      <View
        style={[
          styles.mealsSection,
          { paddingBottom: insets.bottom + 120 + 32 },
        ]}
      >
        <View style={styles.mealsList}>
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mealType) => {
            const group = mealGroups[mealType];

            const groupMealCount = group.count + group.plannedCount;

            return (
              <MealGroupCard
                key={mealType}
                mealType={mealType}
                count={group.count}
                totalCalories={group.calories}
                totalProtein={group.protein}
                totalCarbohydrates={group.carbohydrates}
                totalFat={group.fat}
                items={group.items}
                plannedCalories={group.plannedCalories}
                plannedProtein={group.plannedProtein}
                plannedCarbohydrates={group.plannedCarbohydrates}
                plannedFat={group.plannedFat}
                plannedItems={group.plannedItems}
                plannedCount={group.plannedCount}
                hasPlannedMeals={group.plannedCount > 0}
                isAnalyzing={group.isAnalyzing}
                onPress={
                  groupMealCount > 0 && onMealPress ? () => onMealPress(mealType) : undefined
                }
                onEmptyPress={
                  groupMealCount === 0 ? () => onLogMealPress(dayData.dateString, mealType) : undefined
                }
              />
            );
          })}
          <ActivityGroupCard
            activities={dayActivities}
            onEmptyPress={onActivityLogPress}
            onGroupPress={
              dayActivities.length > 0
                ? () => onActivityGroupPress(dayData.dateString)
                : undefined
            }
            onActivityPress={onActivityItemPress}
          />
        </View>
      </View>
    </ScrollView>
  );
});

type DayCarouselPageProps = {
  dayData: DaysDataItem;
  index: number;
  selectedIndex: number;
  screenWidth: number;
  pageHeight: number;
  token: string | null | undefined;
  insets: { bottom: number };
  profile: UserProfile | undefined;
  rangeData: LogsRangeMap | undefined;
  isRangeLoading: boolean;
  onLogMealPress: (dateString?: string, mealType?: MealTypeTag) => void;
  onMealPress: (dateString: string, mealType: MealTypeTag) => void;
  onActivityLogPress: (dateString: string) => void;
  onActivityGroupPress: (dateString: string) => void;
  onActivityItemPress: (log: ActivityLog) => void;
};

const DayCarouselPage = React.memo(function DayCarouselPage({
  dayData,
  index,
  selectedIndex,
  screenWidth,
  pageHeight,
  token,
  insets,
  profile,
  rangeData,
  isRangeLoading,
  onLogMealPress,
  onMealPress,
  onActivityLogPress,
  onActivityGroupPress,
  onActivityItemPress,
}: DayCarouselPageProps) {
  const onMealLine = useCallback(
    (mealType: MealTypeTag) => onMealPress(dayData.dateString, mealType),
    [dayData.dateString, onMealPress]
  );

  return (
    <View style={{ width: screenWidth, height: pageHeight }}>
      <LogsDayContent
        dayData={dayData}
        isActive={index === selectedIndex}
        token={token}
        insets={insets}
        profile={profile}
        rangeData={rangeData}
        isRangeLoading={isRangeLoading}
        onLogMealPress={onLogMealPress}
        onMealPress={onMealLine}
        onActivityLogPress={() => onActivityLogPress(dayData.dateString)}
        onActivityGroupPress={onActivityGroupPress}
        onActivityItemPress={onActivityItemPress}
      />
    </View>
  );
});

export const LogsScreen = () => {
  const [isEditTimeModalVisible, setIsEditTimeModalVisible] = useState(false);
  const [selectedMealLog, setSelectedMealLog] = useState<MealLog | null>(null);
  const [selectedDateString, setSelectedDateString] = useState<string | null>(() =>
    formatDateString(new Date())
  );
  const { token } = useAuthStore();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: profile } = useUserProfile();
  const carouselRef = useRef(null);
  const carouselProgrammaticGuardRef = useRef(false);
  const carouselProgrammaticGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenWidth = Dimensions.get('window').width;

  const markProgrammaticCarouselScroll = useCallback(() => {
    if (carouselProgrammaticGuardTimerRef.current) {
      clearTimeout(carouselProgrammaticGuardTimerRef.current);
    }
    carouselProgrammaticGuardRef.current = true;
    carouselProgrammaticGuardTimerRef.current = setTimeout(() => {
      carouselProgrammaticGuardRef.current = false;
      carouselProgrammaticGuardTimerRef.current = null;
    }, 600);
  }, []);

  useEffect(() => {
    return () => {
      if (carouselProgrammaticGuardTimerRef.current) {
        clearTimeout(carouselProgrammaticGuardTimerRef.current);
      }
    };
  }, []);

  const [loadedDateStart, setLoadedDateStart] = useState<Date | null>(null);
  const [loadedDateEnd, setLoadedDateEnd] = useState<Date | null>(null);
  const lastWindowKeyRef = useRef<string | null>(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState<Date | null>(null);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

  const [todayDateString, setTodayDateString] = useState(() => formatDateString(new Date()));

  const daysData = React.useMemo(() => {
    if (!loadedDateStart || !loadedDateEnd) {
      return [];
    }

    const days = [];
    const startDate = new Date(loadedDateStart);
    const endDate = new Date(loadedDateEnd);

    let currentDate = new Date(endDate);

    while (currentDate >= startDate) {
      const dateString = formatDateString(currentDate);
      days.push({
        date: new Date(currentDate),
        dateString,
      });
      currentDate.setDate(currentDate.getDate() - 1);
    }

    days.reverse();

    return days;
  }, [loadedDateStart, loadedDateEnd]);

  const findTodayIndex = useCallback(() => {
    if (daysData.length === 0) return -1;
    const todayString = formatDateString(new Date());
    return daysData.findIndex((d) => d.dateString === todayString);
  }, [daysData]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (!hasInitializedSelection) return;
        const currentDateString = formatDateString(new Date());
        if (currentDateString !== todayDateString) {
          setTodayDateString(currentDateString);
          const todayIndex = findTodayIndex();
          if (todayIndex !== -1) {
            const todayString = daysData[todayIndex].dateString;
            setSelectedDateString(todayString);
            headerRef.current?.setDisplayIndex(todayIndex);
            if (carouselRef.current) {
              markProgrammaticCarouselScroll();
              (carouselRef.current as any).scrollToIndex({ index: todayIndex, animated: false });
            }
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [todayDateString, findTodayIndex, hasInitializedSelection, daysData, markProgrammaticCarouselScroll]);

  useEffect(() => {
    if (hasInitializedSelection) return;
    if (daysData.length === 0) return;
    let index =
      selectedDateString != null ? daysData.findIndex((d) => d.dateString === selectedDateString) : -1;

    if (index === -1) {
      const todayIndex = findTodayIndex();
      if (todayIndex !== -1) {
        index = todayIndex;
      } else {
        index = daysData.length - 1;
      }
      const dateString = daysData[index].dateString;
      if (selectedDateString !== dateString) {
        setSelectedDateString(dateString);
      }
    }

    headerRef.current?.setDisplayIndex(index);
    if (carouselRef.current) {
      try {
        markProgrammaticCarouselScroll();
        (carouselRef.current as any).scrollToIndex({ index, animated: false });
      } catch {
        // Ignore initial scroll errors (FlatList not yet measured)
      }
    }

    setHasInitializedSelection(true);
  }, [daysData, selectedDateString, findTodayIndex, hasInitializedSelection, markProgrammaticCarouselScroll]);

  useEffect(() => {
    if (!selectedDateString) return;
    const [year, month, day] = selectedDateString.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    const weekStart = startOfWeek(selectedDate);

    const windowStart = new Date(weekStart);
    windowStart.setDate(windowStart.getDate() - 7);

    const windowEnd = new Date(weekStart);
    windowEnd.setDate(windowEnd.getDate() + 7 + 6);

    setLoadedDateStart(windowStart);
    setLoadedDateEnd(windowEnd);
  }, [selectedDateString]);

  const startStr = loadedDateStart ? formatDateString(loadedDateStart) : '';
  const endStr = loadedDateEnd ? formatDateString(loadedDateEnd) : '';
  const logsRangeQuery = useLogsRange(startStr, endStr);
  const rangeData = logsRangeQuery.data as LogsRangeMap | undefined;
  const isRangeLoading =
    !!token &&
    !!startStr &&
    !!endStr &&
    logsRangeQuery.isFetching &&
    !rangeData &&
    !logsRangeQuery.isError;

  useEffect(() => {
    if (!loadedDateStart || !loadedDateEnd) return;
    if (!selectedDateString) return;
    if (!carouselRef.current) return;

    const windowKey = `${formatDateString(loadedDateStart)}_${formatDateString(loadedDateEnd)}`;
    if (lastWindowKeyRef.current === windowKey) return;
    lastWindowKeyRef.current = windowKey;

    const idx = daysData.findIndex((d) => d.dateString === selectedDateString);
    if (idx === -1) return;

    headerRef.current?.setDisplayIndex(idx);
    try {
      markProgrammaticCarouselScroll();
      (carouselRef.current as any).scrollToIndex({ index: idx, animated: false });
    } catch {
      // ignore layout race conditions; next render will correct it
    }
  }, [loadedDateStart, loadedDateEnd, daysData, selectedDateString, markProgrammaticCarouselScroll]);

  const handleSaveTime = useCallback(
    async (mealLogId: string, newDate: Date) => {
      try {
        await apiClient.patch(`/api/v1/logs/${mealLogId}`, {
          loggedAt: newDate.toISOString(),
        });

        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });

        Alert.alert('Success', 'Meal time updated successfully');
      } catch (error) {
        console.error('Error updating meal time:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to update meal time'
        );
        throw error;
      }
    },
    [queryClient]
  );

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const headerRef = useRef<HeaderHandle>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const weekNavHeight = 64;
  const selectedIndex = React.useMemo(() => {
    if (daysData.length === 0) return 0;
    if (!selectedDateString) return daysData.length - 1;
    const idx = daysData.findIndex((d) => d.dateString === selectedDateString);
    return idx === -1 ? daysData.length - 1 : idx;
  }, [daysData, selectedDateString]);

  const handleLogMealPress = useCallback((dateString?: string, mealType?: MealTypeTag) => {
    router.push({
      pathname: '/chat',
      params:
        dateString && mealType
          ? {
              dateString,
              mealType,
            }
          : undefined,
    });
  }, []);

  const handleActivityLogPress = useCallback(async (dateString: string) => {
    if (Platform.OS === 'ios') {
      await ensureActivityHealthKit();
    }
    router.push({
      pathname: '/chat',
      params: { logger: 'activity', dateString },
    });
  }, []);

  const handleActivityGroupPress = useCallback((dateString: string) => {
    router.push({
      pathname: '/activities-log-detail',
      params: { dateString },
    });
  }, []);

  const handleActivityItemPress = useCallback(
    (log: ActivityLog) => {
      queryClient.setQueryData(['activityLog', log.id], log);
      router.push({
        pathname: '/activity-log-item-detail',
        params: { activityLogId: log.id },
      });
    },
    [queryClient]
  );

  const getDayDataFromRangeCache = useCallback(
    (dateString: string) => {
      const d = logsRangeQuery.data as LogsRangeMap | undefined;
      return d?.[dateString] ?? null;
    },
    [logsRangeQuery.data]
  );

  const handleMealPress = useCallback(
    (dateString: string, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
      const dayData = getDayDataFromRangeCache(dateString);
      if (dayData) {
        queryClient.setQueryData(['logsRange', dateString, dateString], { [dateString]: dayData });
      }
      router.push({
        pathname: '/meal-log-detail',
        params: {
          dateString,
          mealType,
        },
      });
    },
    [getDayDataFromRangeCache, queryClient]
  );

  const pageHeight = Dimensions.get('window').height - insets.top - 80;

  const renderDayCarouselPage = useCallback(
    ({ item, index }: ListRenderItemInfo<DaysDataItem>) => (
      <DayCarouselPage
        dayData={item}
        index={index}
        selectedIndex={selectedIndex}
        screenWidth={screenWidth}
        pageHeight={pageHeight}
        token={token}
        insets={insets}
        profile={profile ?? undefined}
        rangeData={rangeData}
        isRangeLoading={isRangeLoading}
        onLogMealPress={handleLogMealPress}
        onMealPress={handleMealPress}
        onActivityLogPress={handleActivityLogPress}
        onActivityGroupPress={handleActivityGroupPress}
        onActivityItemPress={handleActivityItemPress}
      />
    ),
    [
      selectedIndex,
      screenWidth,
      pageHeight,
      token,
      insets,
      profile,
      rangeData,
      isRangeLoading,
      handleLogMealPress,
      handleMealPress,
      handleActivityLogPress,
      handleActivityGroupPress,
      handleActivityItemPress,
    ]
  );

  const keyExtractor = useCallback((item: DaysDataItem) => item.dateString, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<DaysDataItem> | null | undefined, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth]
  );

  return (
    <View style={styles.container}>
      <LogsScreenHeader
        ref={headerRef}
        daysData={daysData}
        displayIndex={selectedIndex}
        getDayDataFromRangeCache={getDayDataFromRangeCache}
        formatDate={formatDate}
        topInset={insets.top}
        calorieGoal={profile?.daily_calorie_goal}
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (typeof h === 'number' && h > 0 && h !== headerHeight) {
            setHeaderHeight(h);
          }
        }}
        onDatePress={(date) => {
          setTempPickerDate(date);
          setIsDatePickerVisible(true);
        }}
      />

      <WeekCalendarNav
        selectedDateString={selectedDateString}
        topOffset={insets.top + headerHeight}
        onDayPress={(date) => {
          const dateString = formatDateString(date);
          setSelectedDateString(dateString);
          const idx = daysData.findIndex((d) => d.dateString === dateString);
          if (idx !== -1) {
            headerRef.current?.setDisplayIndex(idx);
            if (carouselRef.current) {
              markProgrammaticCarouselScroll();
              (carouselRef.current as any).scrollToIndex({
                index: idx,
                animated: false,
              });
            }
          }
        }}
      />

      <View style={[styles.carouselContainer, { top: insets.top + headerHeight + weekNavHeight }]}>
        {daysData.length === 0 ? (
          <View style={styles.centered}>
            <LottieLoadingSpinner width={140} />
            <Text style={styles.loadingText}>Loading logs...</Text>
          </View>
        ) : (
          <FlatList
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={daysData}
            keyExtractor={keyExtractor}
            initialScrollIndex={selectedIndex}
            getItemLayout={getItemLayout}
            onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const pageWidth = screenWidth;
              const newIndex = Math.round(offsetX / pageWidth);
              const clampedIndex = Math.max(0, Math.min(newIndex, daysData.length - 1));
              if (carouselProgrammaticGuardRef.current) {
                carouselProgrammaticGuardRef.current = false;
                if (carouselProgrammaticGuardTimerRef.current) {
                  clearTimeout(carouselProgrammaticGuardTimerRef.current);
                  carouselProgrammaticGuardTimerRef.current = null;
                }
                return;
              }
              if (clampedIndex !== selectedIndex) {
                const dateString = daysData[clampedIndex].dateString;
                setSelectedDateString(dateString);
                headerRef.current?.setDisplayIndex(clampedIndex);
              }
            }}
            renderItem={renderDayCarouselPage}
            extraData={`${selectedIndex}-${logsRangeQuery.dataUpdatedAt}`}
          />
        )}
      </View>

      <Modal
        visible={isDatePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.datePickerBackdrop}
          activeOpacity={1}
          onPress={() => setIsDatePickerVisible(false)}
        >
          <View style={styles.datePickerContainer}>
            <Calendar
              current={
                tempPickerDate
                  ? formatDateString(tempPickerDate)
                  : selectedDateString || formatDateString(new Date())
              }
              markedDates={
                selectedDateString
                  ? {
                      [selectedDateString]: {
                        selected: true,
                        selectedColor: '#000',
                        selectedTextColor: '#fff',
                      },
                    }
                  : undefined
              }
              onDayPress={(day) => {
                setIsDatePickerVisible(false);
                setSelectedDateString(day.dateString);
              }}
              enableSwipeMonths={true}
              theme={{
                todayTextColor: '#000',
                arrowColor: '#000',
              }}
            />
            <TouchableOpacity
              style={styles.todayButton}
              activeOpacity={0.8}
              onPress={() => {
                const today = new Date();
                const todayString = formatDateString(today);
                setIsDatePickerVisible(false);
                setSelectedDateString(todayString);
              }}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <EditTimeModal
        visible={isEditTimeModalVisible}
        mealLog={selectedMealLog}
        onClose={() => {
          setIsEditTimeModalVisible(false);
          setSelectedMealLog(null);
        }}
        onSave={handleSaveTime}
      />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  staticHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerCaloriesBlock: {
    alignItems: 'flex-end',
  },
  headerCaloriesTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  dailyCaloriesGoalSuffix: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6a7282',
  },
  dailyCaloriesLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  dailyCaloriesPlanned: {
    fontSize: 12,
    fontWeight: '600',
    color: '#101828',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 4,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#4a5565',
  },
  carouselContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#6a7282',
    fontSize: 14,
    marginTop: 12,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 16,
  },
  mealsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mealsList: {
    gap: 12,
  },
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  todayButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#000',
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  dailyCalories: {
    fontSize: 24,
    fontWeight: '600',
    color: '#101828',
  },
  dailyCaloriesLabel: {
    fontSize: 12,
    color: '#6a7282',
  },
});
