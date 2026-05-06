import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel from 'react-native-reanimated-carousel';
import { MacroBarChart } from '../components/MacroBarChart';
import { MacroGoalsProgress } from '../components/MacroGoalsProgress';
import { useWeeklyStats, getWeekStart } from '../hooks/useWeeklyStats';

// Number of weeks available to swipe back
const NUM_WEEKS = 12;

// Generate array of week start dates (current week is last)
const generateWeekStarts = (): Date[] => {
  const weeks: Date[] = [];
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (i * 7));
    weeks.push(weekStart);
  }
  
  return weeks;
};

// Component for each week's content
const WeekContent: React.FC<{ weekStart: Date }> = ({ weekStart }) => {
  const { days, weeklyTotals, dailyGoals, daysForCalculation, deviationPercent, isLoading } = useWeeklyStats(weekStart);
  const insets = useSafeAreaInsets();
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  
  return (
    <ScrollView 
      style={styles.weekContent} 
      contentContainerStyle={[
        styles.weekContentContainer,
        { paddingBottom: insets.bottom + 120 + 32 + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Bar Chart */}
      <MacroBarChart days={days} />
      
      {/* Divider */}
      <View style={styles.divider} />
      
      {/* Macro Goals Progress */}
      <MacroGoalsProgress
        weeklyTotals={weeklyTotals}
        dailyGoals={dailyGoals}
        daysForCalculation={daysForCalculation}
        deviationPercent={deviationPercent}
      />
    </ScrollView>
  );
};

export const StatsScreen = () => {
  const insets = useSafeAreaInsets();
  const carouselRef = useRef<any>(null);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  
  const [weekStarts, setWeekStarts] = useState(() => generateWeekStarts());
  const [currentIndex, setCurrentIndex] = useState(NUM_WEEKS - 1); // Start at current week
  
  // Get current week label
  const getCurrentWeekLabel = () => {
    const weekStart = weekStarts[currentIndex];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerWrapper}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <View>
                <Text style={styles.title}>Weekly Stats</Text>
                <Text style={styles.subtitle}>{getCurrentWeekLabel()}</Text>
              </View>
            </View>
          </View>
          
          {/* Color Legend */}
          <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
              <Text style={styles.legendText}>Protein</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
              <Text style={styles.legendText}>Carbs</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9810fa' }]} />
              <Text style={styles.legendText}>Fat</Text>
            </View>
          </View>
        </View>
        
        {/* Divider */}
        <View style={styles.headerDivider} />
      </View>
      
      {/* Swipeable Content */}
      <View style={styles.carouselContainer}>
        <Carousel
          ref={carouselRef}
          loop={false}
          width={screenWidth}

          data={weekStarts}
          scrollAnimationDuration={300}
          onSnapToItem={setCurrentIndex}
          renderItem={({ item }) => (
            <WeekContent weekStart={item} />
          )}
          defaultIndex={NUM_WEEKS - 1}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  headerWrapper: {
    backgroundColor: 'white',
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6a7282',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 14,
    color: '#101828',
    fontWeight: '500',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  carouselContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  weekContent: {
    flex: 1,
    backgroundColor: 'white',
  },
  weekContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 24,
    marginBottom: 24,
  },
});
