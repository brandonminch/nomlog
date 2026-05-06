import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Path } from 'react-native-svg';
import { DayStats } from '../hooks/useWeeklyStats';

interface MacroBarChartProps {
  days: DayStats[];
}

const COLORS = {
  protein: '#dc2626', // Red
  carbs: '#eab308',   // Yellow
  fat: '#9810fa',     // Purple
};

const CHART_HEIGHT = 280;
const BAR_AREA_HEIGHT = 240;
const TOP_PADDING = 30;
const BOTTOM_PADDING = 10;

export const MacroBarChart: React.FC<MacroBarChartProps> = ({ days }) => {
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 64; // Account for modal padding
  
  // Calculate dimensions - single bar per day
  const groupWidth = chartWidth / 7;
  const barWidth = groupWidth - 16; // Single bar with padding
  
  // Find max calorie goal to scale the chart
  const maxCalorieGoal = Math.max(...days.map(d => d.calorieGoal), 2000);
  // Allow bars to go up to 150% of goal for visual display
  const maxCalories = maxCalorieGoal * 1.5;
  
  // Scale: calories to bar height
  const getBarHeight = (calories: number) => {
    const cappedCalories = Math.min(calories, maxCalories);
    return (cappedCalories / maxCalories) * BAR_AREA_HEIGHT;
  };
  
  const getBarY = (calories: number) => {
    const height = getBarHeight(calories);
    return TOP_PADDING + BAR_AREA_HEIGHT - height;
  };
  
  // Position of calorie goal reference line
  const goalLineY = TOP_PADDING + BAR_AREA_HEIGHT - (maxCalorieGoal / maxCalories) * BAR_AREA_HEIGHT;
  
  // Format calorie number for display
  const formatCalories = (cal: number) => {
    if (cal >= 1000) {
      return `${(cal / 1000).toFixed(1)}k`;
    }
    return Math.round(cal).toString();
  };
  
  // Helper to create a path for a rectangle with only top corners rounded
  const createRoundedTopRectPath = (
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): string => {
    // Start from bottom-left corner, move to start of top-left rounded corner
    const start = `M ${x} ${y + height}`;
    // Line up to start of top-left rounded corner
    const leftEdge = `L ${x} ${y + radius}`;
    // Arc for top-left rounded corner (sweep flag 0 = counterclockwise)
    const topLeftArc = `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`;
    // Top edge
    const topEdge = `L ${x + width - radius} ${y}`;
    // Arc for top-right rounded corner
    const topRightArc = `A ${radius} ${radius} 0 0 1 ${x + width} ${y + radius}`;
    // Right edge down to bottom
    const rightEdge = `L ${x + width} ${y + height}`;
    // Close path back to start
    const close = `Z`;
    
    return `${start} ${leftEdge} ${topLeftArc} ${topEdge} ${topRightArc} ${rightEdge} ${close}`;
  };
  
  // Helper to create a path for a rectangle with all square corners
  const createSquareRectPath = (
    x: number,
    y: number,
    width: number,
    height: number
  ): string => {
    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
  };

  return (
    <View style={styles.container}>
      {/* Y-axis label - "Calories" at top left */}
      <Text style={styles.yAxisLabel}>Calories</Text>
      
      {/* Calorie Goal Label - positioned at the goal line */}
      <Text style={[styles.calorieLabel, { top: goalLineY - 8 }]}>
        {formatCalories(maxCalorieGoal)}
      </Text>
      
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {/* Calorie Goal Reference Line */}
        <Line
          x1={0}
          y1={goalLineY}
          x2={chartWidth}
          y2={goalLineY}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        
        {/* Stacked bars for each day */}
        {days.map((day, dayIndex) => {
          const groupX = dayIndex * groupWidth + 8; // 8px padding on left of group
          const barHeight = getBarHeight(day.calories);
          const barY = getBarY(day.calories);
          
          // Calculate segment heights based on macro percentages
          const proteinHeight = (day.proteinPercent / 100) * barHeight;
          const carbsHeight = (day.carbsPercent / 100) * barHeight;
          const fatHeight = (day.fatPercent / 100) * barHeight;
          
          // Calculate Y positions for each segment (stacked from bottom to top)
          // In SVG, Y increases downward, so barY is the top of the bar
          // Bottom of bar is at barY + barHeight
          const barBottom = barY + barHeight;
          
          // Protein at bottom, then carbs, then fat at top
          const proteinY = barBottom - proteinHeight;
          const carbsY = proteinY - carbsHeight;
          const fatY = carbsY - fatHeight;
          
          // Determine which segment is at the top (closest to barY)
          // Only the top segment should have rounded top corners
          const hasFat = fatHeight > 0;
          const hasCarbs = carbsHeight > 0;
          const topSegmentIsFat = hasFat;
          const topSegmentIsCarbs = !hasFat && hasCarbs;
          const topSegmentIsProtein = !hasFat && !hasCarbs && proteinHeight > 0;
          
          const radius = 4;
          
          return (
            <React.Fragment key={day.date}>
              {/* Protein segment (bottom) */}
              {proteinHeight > 0 && (
                <Path
                  d={topSegmentIsProtein 
                    ? createRoundedTopRectPath(groupX, proteinY, barWidth, proteinHeight, radius)
                    : createSquareRectPath(groupX, proteinY, barWidth, proteinHeight)
                  }
                  fill={COLORS.protein}
                />
              )}
              
              {/* Carbs segment (middle) */}
              {carbsHeight > 0 && (
                <Path
                  d={topSegmentIsCarbs
                    ? createRoundedTopRectPath(groupX, carbsY, barWidth, carbsHeight, radius)
                    : createSquareRectPath(groupX, carbsY, barWidth, carbsHeight)
                  }
                  fill={COLORS.carbs}
                />
              )}
              
              {/* Fat segment (top) */}
              {fatHeight > 0 && (
                <Path
                  d={topSegmentIsFat
                    ? createRoundedTopRectPath(groupX, fatY, barWidth, fatHeight, radius)
                    : createSquareRectPath(groupX, fatY, barWidth, fatHeight)
                  }
                  fill={COLORS.fat}
                />
              )}
            </React.Fragment>
          );
        })}
      </Svg>
      
      {/* Day Labels */}
      <View style={styles.dayLabelsContainer}>
        {days.map((day) => (
          <View key={day.date} style={[styles.dayLabelWrapper, { width: groupWidth }]}>
            <Text style={styles.dayLabel}>{day.dayName}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingLeft: 50, // Space for calorie label
  },
  yAxisLabel: {
    position: 'absolute',
    left: 0,
    top: 0,
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '500',
  },
  calorieLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  dayLabelsContainer: {
    flexDirection: 'row',
    marginLeft: 0,
  },
  dayLabelWrapper: {
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '500',
  },
});







