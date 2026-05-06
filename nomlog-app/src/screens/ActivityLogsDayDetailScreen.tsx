import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useLogsRange } from '../hooks/useLogsRange';
import type { ActivityLog } from '../types/activityLog';

type Params = {
  dateString?: string | string[];
};

export const ActivityLogsDayDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const queryClient = useQueryClient();

  const dateStringParam = Array.isArray(params.dateString) ? params.dateString[0] : params.dateString;
  const dateString = dateStringParam || '';

  const { data: rangeData, isLoading } = useLogsRange(dateString, dateString);
  const dayDataForDate = rangeData?.[dateString];
  const activities = (dayDataForDate?.activities ?? []) as ActivityLog[];

  const totalBurned = useMemo(
    () =>
      activities.reduce((sum, a) => {
        const c = a.calories_burned != null ? Number(a.calories_burned) : 0;
        return sum + (Number.isFinite(c) ? c : 0);
      }, 0),
    [activities]
  );

  const formatDate = (dateStringValue: string) => {
    if (!dateStringValue) return '';
    const [year, month, day] = dateStringValue.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleRowPress = useCallback(
    (log: ActivityLog) => {
      queryClient.setQueryData(['activityLog', log.id], log);
      router.push({
        pathname: '/activity-log-item-detail',
        params: { activityLogId: log.id },
      });
    },
    [queryClient]
  );

  if (isLoading && !dayDataForDate) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Activities</Text>
          <Text style={styles.headerSubtitle}>{formatDate(dateString)}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              router.push({
                pathname: '/chat',
                params: { logger: 'activity', dateString },
              });
            }}
            style={styles.headerPlusButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Plus size={22} color="#111827" strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCaloriesBlock}>
            <Text style={styles.headerCalories}>{Math.round(totalBurned)}</Text>
            <Text style={styles.headerCaloriesLabel}>kcal burned</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {activities.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No activities logged</Text>
            <Text style={styles.emptySubtitle}>Tap the plus button above to log an activity.</Text>
          </View>
        ) : (
          activities.map((log) => (
            <TouchableOpacity
              key={log.id}
              style={styles.row}
              onPress={() => handleRowPress(log)}
              activeOpacity={0.75}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {log.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {log.calories_burned != null && Number(log.calories_burned) > 0
                    ? `${Math.round(Number(log.calories_burned))} kcal`
                    : '—'}
                </Text>
              </View>
              <ChevronRight size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6B7280',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerPlusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerCaloriesBlock: {
    alignItems: 'flex-end',
  },
  headerCalories: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerCaloriesLabel: {
    fontSize: 11,
    color: '#6B7280',
    maxWidth: 88,
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#f3e8ff',
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#7c3aed',
  },
  emptyContainer: {
    marginTop: 32,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});
