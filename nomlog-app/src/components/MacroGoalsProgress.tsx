import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dumbbell, Wheat, Droplet } from 'lucide-react-native';

interface MacroGoalsProgressProps {
  weeklyTotals: {
    protein: number;
    carbs: number;
    fat: number;
  };
  dailyGoals: {
    protein: number;
    carbs: number;
    fat: number;
  };
  daysForCalculation: number;
  deviationPercent: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface MacroItemProps {
  label: string;
  icon: React.ComponentType<any>;
  current: number;
  goal: number;
  deviationPercent: number;
  iconColor: string;
  indicatorColor: string;
  currentValueColor: string;
}

const MacroItem: React.FC<MacroItemProps> = ({
  label,
  icon: Icon,
  current,
  goal,
  deviationPercent,
  iconColor,
  indicatorColor,
  currentValueColor,
}) => {
  // Calculate indicator position: 0% deviation = center (50%), -100% = left (0%), +100% = right (100%)
  const indicatorPosition = Math.max(0, Math.min(100, 50 + (deviationPercent / 2)));

  // Format numbers
  const formatNumber = (num: number) => Math.round(num);

  return (
    <View style={styles.macroItem}>
      {/* Icon, Label, and Value Display on same line */}
      <View style={styles.macroHeader}>
        <View style={styles.macroHeaderLeft}>
          <Icon size={20} color={iconColor} />
          <Text style={styles.macroLabel}>{label}</Text>
        </View>
        <View style={styles.valueContainer}>
          <Text style={[styles.currentValue, { color: currentValueColor }]}>
            {formatNumber(current)}g
          </Text>
          <Text style={styles.separator}> / </Text>
          <Text style={styles.goalValue}>{formatNumber(goal)}g</Text>
        </View>
      </View>

      {/* Progress Bar Container */}
      <View style={styles.progressContainer}>
        {/* Track with markers */}
        <View style={styles.trackWrapper}>
          <Text style={styles.markerText}>-100%</Text>
          <View style={styles.trackContainer}>
            <View style={styles.track} />
            {/* Goal marker line */}
            <View style={[styles.goalMarker, { left: '50%' }]} />
            {/* Indicator */}
            <View
              style={[
                styles.indicator,
                {
                  left: `${indicatorPosition}%`,
                  backgroundColor: indicatorColor,
                },
              ]}
            />
          </View>
          <Text style={styles.markerText}>+100%</Text>
        </View>
        {/* Goal label below the bar */}
        <View style={styles.goalLabelContainer}>
          <Text style={styles.goalLabelText}>Goal</Text>
        </View>
      </View>
    </View>
  );
};

export const MacroGoalsProgress: React.FC<MacroGoalsProgressProps> = ({
  weeklyTotals,
  dailyGoals,
  daysForCalculation,
  deviationPercent,
}) => {
  // Calculate daily averages
  const dailyAverages = {
    protein: daysForCalculation > 0 ? weeklyTotals.protein / daysForCalculation : 0,
    carbs: daysForCalculation > 0 ? weeklyTotals.carbs / daysForCalculation : 0,
    fat: daysForCalculation > 0 ? weeklyTotals.fat / daysForCalculation : 0,
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Macro Goals Progress</Text>
        <Text style={styles.caption}>Daily Averages</Text>
      </View>
      
      <View style={styles.macrosContainer}>
        {/* Protein */}
        <MacroItem
          label="Protein"
          icon={Dumbbell}
          current={dailyAverages.protein}
          goal={dailyGoals.protein}
          deviationPercent={deviationPercent.protein}
          iconColor="#dc2626"
          indicatorColor="#dc2626"
          currentValueColor="#dc2626"
        />

        {/* Carbs */}
        <MacroItem
          label="Carbs"
          icon={Wheat}
          current={dailyAverages.carbs}
          goal={dailyGoals.carbs}
          deviationPercent={deviationPercent.carbs}
          iconColor="#ca8a04"
          indicatorColor="#eab308"
          currentValueColor="#ca8a04"
        />

        {/* Fat */}
        <MacroItem
          label="Fat"
          icon={Droplet}
          current={dailyAverages.fat}
          goal={dailyGoals.fat}
          deviationPercent={deviationPercent.fat}
          iconColor="#9810fa"
          indicatorColor="#9810fa"
          currentValueColor="#9810fa"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6a7282',
  },
  macrosContainer: {
    gap: 16,
  },
  macroItem: {
    gap: 8,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macroHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101828',
  },
  progressContainer: {
    marginTop: 4,
  },
  trackWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markerText: {
    fontSize: 10,
    color: '#6a7282',
    fontWeight: '500',
    width: 45,
    textAlign: 'center',
  },
  trackContainer: {
    flex: 1,
    position: 'relative',
    height: 20,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    width: '100%',
    position: 'absolute',
    top: 8,
  },
  goalMarker: {
    position: 'absolute',
    width: 1,
    height: 12,
    backgroundColor: '#9ca3af',
    marginLeft: -0.5,
    top: 4, // Center on track: track is at top:8, height:4, so center is at 10, marker center should be at 10, so top = 10 - 6 = 4
  },
  goalLabelContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  goalLabelText: {
    fontSize: 10,
    color: '#6a7282',
    fontWeight: '500',
  },
  indicator: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8, // Center the indicator on the position
    top: 2, // Center on track: track is at top:8, height:4, so center is at 10, indicator center should be at 10, so top = 10 - 8 = 2
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  separator: {
    fontSize: 16,
    color: '#6a7282',
    marginHorizontal: 4,
  },
  goalValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6a7282',
  },
});
