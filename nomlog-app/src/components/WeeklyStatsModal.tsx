import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel from 'react-native-reanimated-carousel';
import { MacroBarChart } from './MacroBarChart';
import { MacroGoalsProgress } from './MacroGoalsProgress';
import { useWeeklyStats, getWeekStart } from '../hooks/useWeeklyStats';

interface WeeklyStatsModalProps {
  visible: boolean;
  onClose: () => void;
}

// Number of weeks available to swipe back
const NUM_WEEKS = 12;

// Generate array of week start dates (current week is last)
const generateWeekStarts = (): Date[] => {
  const weeks: Date[] = [];
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  
  console.log('[generateWeekStarts] Today:', today.toISOString(), 'Current week start (Monday):', currentWeekStart.toISOString());
  
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - (i * 7));
    weeks.push(weekStart);
  }
  
  console.log('[generateWeekStarts] Generated weeks:', weeks.map(d => d.toISOString().split('T')[0]));
  
  return weeks;
};

// Component for each week's content
const WeekContent: React.FC<{ weekStart: Date }> = ({ weekStart }) => {
  const { days, weeklyTotals, dailyGoals, daysForCalculation, deviationPercent, isLoading } = useWeeklyStats(weekStart);
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  
  return (
    <View style={styles.weekContent}>
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
    </View>
  );
};

export const WeeklyStatsModal: React.FC<WeeklyStatsModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const carouselRef = useRef<any>(null);
  const screenWidth = Dimensions.get('window').width;
  
  const [weekStarts, setWeekStarts] = useState(() => generateWeekStarts());
  const [currentIndex, setCurrentIndex] = useState(NUM_WEEKS - 1); // Start at current week
  
  // Snap points - 95% of screen height to fit all content
  const snapPoints = useMemo(() => ['95%'], []);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  // Backdrop component
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Present/dismiss based on visibility
  useEffect(() => {
    if (visible) {
      // Regenerate week dates when opening to ensure they're current
      const freshWeekStarts = generateWeekStarts();
      setWeekStarts(freshWeekStarts);
      // Reset to current week when opening
      setCurrentIndex(NUM_WEEKS - 1);
      // Reset carousel to last index
      setTimeout(() => {
        carouselRef.current?.scrollTo({ index: NUM_WEEKS - 1, animated: false });
      }, 100);
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);
  
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
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      enablePanDownToClose={true}
      topInset={insets.top}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.contentContainer}>
        {/* Sticky Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.title}>Weekly Stats</Text>
              <Text style={styles.subtitle}>{getCurrentWeekLabel()}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#6a7282" />
            </TouchableOpacity>
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
        
        {/* Swipeable Content */}
        <View style={styles.carouselContainer}>
          <Carousel
            ref={carouselRef}
            loop={false}
            width={screenWidth}
            height={580}
            data={weekStarts}
            scrollAnimationDuration={300}
            onSnapToItem={setCurrentIndex}
            renderItem={({ item }) => (
              <WeekContent weekStart={item} />
            )}
            defaultIndex={NUM_WEEKS - 1}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: '#d1d5dc',
    width: 48,
    height: 6,
  },
  contentContainer: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 24,
    marginBottom: 24,
  },
});







