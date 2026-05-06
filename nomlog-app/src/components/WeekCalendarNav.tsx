import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';

type WeekCalendarNavProps = {
  selectedDateString: string | null;
  onDayPress: (date: Date) => void;
  topOffset?: number;
};

type WeekItem = {
  weekIndex: number;
  startDate: Date;
};

const screenWidth = Dimensions.get('window').width;
const WEEK_RADIUS = 52; // ~2 years of weeks in each direction

const startOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const WeekCalendarNav: React.FC<WeekCalendarNavProps> = ({
  selectedDateString,
  onDayPress,
  topOffset,
}) => {
  const flatListRef = useRef<FlatList<WeekItem>>(null);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayString = React.useMemo(() => formatDateString(today), [today]);

  // Virtual list of weeks around today
  const weeks: WeekItem[] = React.useMemo(() => {
    const result: WeekItem[] = [];
    for (let offset = -WEEK_RADIUS; offset <= WEEK_RADIUS; offset++) {
      const base = addDays(today, offset * 7);
      result.push({
        weekIndex: offset + WEEK_RADIUS,
        startDate: startOfWeek(base),
      });
    }
    return result;
  }, [today]);

  const selectedWeekIndex = React.useMemo(() => {
    if (!selectedDateString) return WEEK_RADIUS;
    const [year, month, day] = selectedDateString.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    target.setHours(0, 0, 0, 0);

    const index = weeks.findIndex((week) => {
      const start = week.startDate;
      const end = addDays(start, 6);
      return target >= start && target <= end;
    });

    return index === -1 ? WEEK_RADIUS : index;
  }, [weeks, selectedDateString]);

  // Keep the week strip scrolled to the week containing the selected day
  useEffect(() => {
    if (!flatListRef.current || weeks.length === 0) return;
    const animated = false;
    flatListRef.current.scrollToIndex({
      index: selectedWeekIndex,
      animated,
    });
  }, [selectedWeekIndex, weeks.length]);

  if (weeks.length === 0) {
    return null;
  }

  const renderWeek = ({ item }: { item: WeekItem }) => {
    const daysForWeek = Array.from({ length: 7 }, (_, i) => addDays(item.startDate, i));
    return (
      <View style={[styles.weekContainer, { width: screenWidth }]}>
        {daysForWeek.map((date) => {
          const dateString = formatDateString(date);
          const isSelected = selectedDateString === dateString;
          const isToday = dateString === todayString;
          const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
          const dayOfMonth = date.getDate();

          return (
            <TouchableOpacity
              key={dateString}
              style={styles.dayPill}
              onPress={() => onDayPress(date)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dayWeekday, isSelected && styles.dayWeekdaySelected]}>
                {weekday}
              </Text>
              <View
                style={[
                  styles.dayNumberCircle,
                  isToday && !isSelected && styles.dayNumberCircleToday,
                  isSelected && styles.dayNumberCircleSelected,
                ]}
              >
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                  {dayOfMonth}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.container, topOffset != null ? { top: topOffset } : null]}>
      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={weeks}
        keyExtractor={(item) => `week-${item.weekIndex}`}
        renderItem={renderWeek}
        initialScrollIndex={WEEK_RADIUS}
        getItemLayout={(_data, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  weekContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    marginHorizontal: 4,
  },
  dayWeekday: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  dayWeekdaySelected: {
    color: '#111827',
    fontWeight: '600',
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  dayNumberSelected: {
    color: '#f9fafb',
  },
  dayNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberCircleSelected: {
    backgroundColor: '#000',
  },
  dayNumberCircleToday: {
    borderWidth: 1,
    borderColor: '#000',
  },
});

