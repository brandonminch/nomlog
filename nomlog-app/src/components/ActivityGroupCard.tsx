import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus, Dumbbell } from 'lucide-react-native';
import type { ActivityLog } from '../types/activityLog';

export type ActivityGroupCardProps = {
  activities: ActivityLog[];
  onEmptyPress?: () => void;
  /** Tapping the header (title + subtitle), not the + button, when there is at least one activity. */
  onGroupPress?: () => void;
  onActivityPress?: (log: ActivityLog) => void;
};

export const ActivityGroupCard: React.FC<ActivityGroupCardProps> = ({
  activities,
  onEmptyPress,
  onGroupPress,
  onActivityPress,
}) => {
  const hasActivities = activities.length > 0;
  const totalBurned = activities.reduce((sum, a) => {
    const c = a.calories_burned != null ? Number(a.calories_burned) : 0;
    return sum + (Number.isFinite(c) ? c : 0);
  }, 0);

  if (!hasActivities) {
    return (
      <View style={styles.emptyRowContainer}>
        <View style={styles.emptyRowLeft}>
          <View style={[styles.iconCircle, styles.iconCircleActivities]}>
            <Dumbbell size={20} color="#7A29DD" strokeWidth={2} />
          </View>
          <View style={styles.emptyRowTextContainer}>
            <Text style={styles.emptyRowTitle}>Activities</Text>
            <Text style={styles.emptyRowSubtitle}>No activities logged</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onEmptyPress}
          activeOpacity={0.8}
          style={styles.emptyRowPlusButton}
          accessibilityRole="button"
          accessibilityLabel="Open activity logger"
        >
          <Plus size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  }

  const headerLeft = (
    <View style={styles.emptyRowLeft}>
      <View style={[styles.iconCircle, styles.iconCircleActivities]}>
        <Dumbbell size={20} color="#7A29DD" strokeWidth={2} />
      </View>
      <View style={styles.emptyRowTextContainer}>
        <Text style={styles.emptyRowTitle}>Activities</Text>
        <Text style={styles.filledSubtitle}>
          {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          {totalBurned > 0 ? ` · ${Math.round(totalBurned)} kcal burned` : ''}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.filledContainer}>
      <View style={styles.filledHeader}>
        {onGroupPress ? (
          <TouchableOpacity
            onPress={onGroupPress}
            activeOpacity={0.75}
            style={styles.headerLeftPressable}
            accessibilityRole="button"
            accessibilityLabel="View activities for this day"
          >
            {headerLeft}
          </TouchableOpacity>
        ) : (
          headerLeft
        )}
        <TouchableOpacity
          onPress={onEmptyPress}
          activeOpacity={0.8}
          style={styles.emptyRowPlusButton}
          accessibilityRole="button"
          accessibilityLabel="Add activity"
        >
          <Plus size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <View style={styles.itemList}>
        {activities.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.itemRow}
            onPress={() => onActivityPress?.(a)}
            activeOpacity={0.75}
            disabled={!onActivityPress}
          >
            <Text style={styles.itemTitle} numberOfLines={1}>
              {a.name}
            </Text>
            <Text style={styles.itemMeta}>
              {a.calories_burned != null && Number(a.calories_burned) > 0
                ? `${Math.round(Number(a.calories_burned))} kcal`
                : '—'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
  },
  filledContainer: {
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3e8ff',
  },
  filledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemList: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginRight: 12,
  },
  itemMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7c3aed',
  },
  filledSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  iconCircleActivities: {
    backgroundColor: '#F2DEFF',
  },
  emptyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerLeftPressable: {
    flex: 1,
    marginRight: 8,
  },
  emptyRowTextContainer: {
    marginLeft: 12,
  },
  emptyRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptyRowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  emptyRowPlusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
