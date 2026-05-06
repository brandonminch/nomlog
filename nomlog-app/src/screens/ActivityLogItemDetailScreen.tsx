import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, MoreVertical } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import type { ActivityExerciseSegment, ActivityLog } from '../types/activityLog';
import { ActivityLogExercisesSection } from '../components/ActivityLogExercisesSection';
import { EditActivityTimeModal } from '../components/EditActivityTimeModal';
import { formatMealDate } from '../utils/dateFormat';
import { validateManualExerciseSegments } from '../utils/activityValidation';

type Params = {
  activityLogId?: string | string[];
};

function exercisesEqual(a: ActivityExerciseSegment[], b: ActivityExerciseSegment[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const ActivityLogItemDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const activityLogId = Array.isArray(params.activityLogId) ? params.activityLogId[0] : params.activityLogId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState<ActivityExerciseSegment[]>([]);
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: activityLog, isLoading } = useQuery({
    queryKey: ['activityLog', activityLogId],
    queryFn: async () => {
      if (!activityLogId) return null;
      const row = await apiClient.get(`/api/v1/activity-logs/${activityLogId}`);
      return row as ActivityLog;
    },
    enabled: !!token && !!activityLogId,
  });

  useEffect(() => {
    if (!activityLog) return;
    setName(activityLog.name);
    setDescription(activityLog.description ?? '');
    setExercises(JSON.parse(JSON.stringify(activityLog.exercises ?? [])) as ActivityExerciseSegment[]);
  }, [activityLog?.id, activityLog?.updated_at]);

  const analysisInProgress =
    activityLog?.analysis_status === 'pending' || activityLog?.analysis_status === 'analyzing';

  const isDirty = useMemo(() => {
    if (!activityLog) return false;
    if (name.trim() !== activityLog.name) return true;
    if ((description || '') !== (activityLog.description ?? '')) return true;
    if (!exercisesEqual(exercises, activityLog.exercises ?? [])) return true;
    return false;
  }, [activityLog, name, description, exercises]);

  const handleSaveActivityTime = useCallback(
    async (id: string, newDate: Date) => {
      try {
        await apiClient.patch(`/api/v1/activity-logs/${id}`, {
          loggedAt: newDate.toISOString(),
        });
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        await queryClient.invalidateQueries({ queryKey: ['activityLog', id] });
        Alert.alert('Success', 'Activity time updated');
      } catch (error) {
        console.error('Error updating activity time:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to update activity time'
        );
        throw error;
      }
    },
    [queryClient]
  );

  const handleSave = useCallback(async () => {
    if (!activityLogId || !activityLog) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this activity.');
      return;
    }
    const validationErrors = validateManualExerciseSegments(exercises);
    if (validationErrors.length > 0) {
      Alert.alert('More detail needed', validationErrors[0]);
      return;
    }
    const payload: Record<string, unknown> = {};
    if (name.trim() !== activityLog.name) payload.name = name.trim();
    if ((description || '') !== (activityLog.description ?? '')) {
      payload.description = description.trim() || null;
    }
    if (!exercisesEqual(exercises, activityLog.exercises ?? [])) {
      payload.exercises = exercises;
    }
    if (Object.keys(payload).length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiClient.patch(`/api/v1/activity-logs/${activityLogId}`, payload);
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      queryClient.setQueryData(['activityLog', activityLogId], updated as ActivityLog);
      Alert.alert('Success', 'Activity updated');
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Error', error instanceof ApiError ? error.message : 'Failed to save activity');
    } finally {
      setIsSaving(false);
    }
  }, [activityLog, activityLogId, description, exercises, name, queryClient]);

  const handleDelete = useCallback(() => {
    if (!activityLogId) return;
    Alert.alert('Delete activity', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/api/v1/activity-logs/${activityLogId}`);
            await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
            queryClient.removeQueries({ queryKey: ['activityLog', activityLogId] });
            router.back();
          } catch (error) {
            console.error('Error deleting activity:', error);
            Alert.alert(
              'Error',
              error instanceof ApiError ? error.message : 'Failed to delete activity'
            );
          }
        },
      },
    ]);
  }, [activityLogId, queryClient]);

  const openOverflow = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert('Activity', undefined, [
      { text: 'Change time', onPress: () => setTimeModalVisible(true) },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleDelete]);

  const renderHeader = (showMenu: boolean) => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={20} color="#111827" />
      </TouchableOpacity>
      <View style={styles.headerSpacer} />
      {showMenu && activityLog ? (
        <TouchableOpacity
          onPress={openOverflow}
          style={styles.menuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="More options"
        >
          <MoreVertical size={22} color="#111827" />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (!activityLogId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Missing activity.</Text>
        </View>
      </View>
    );
  }

  if (isLoading && !activityLog) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!activityLog) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load this activity.</Text>
        </View>
      </View>
    );
  }

  const kcal =
    activityLog.calories_burned != null && Number(activityLog.calories_burned) > 0
      ? Math.round(Number(activityLog.calories_burned))
      : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderHeader(true)}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 100,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={styles.titleInput}
          value={name}
          onChangeText={setName}
          placeholder="Activity name"
          placeholderTextColor="#9ca3af"
        />
        <TextInput
          style={styles.descInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor="#9ca3af"
          multiline
        />

        <TouchableOpacity
          style={styles.timeRow}
          onPress={() => setTimeModalVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.timeLabel}>Logged at</Text>
          <Text style={styles.timeValue}>{formatMealDate(new Date(activityLog.logged_at))}</Text>
        </TouchableOpacity>

        <View style={styles.kcalRow}>
          <Text style={styles.kcalLabel}>Calories burned</Text>
          {analysisInProgress ? (
            <Text style={styles.estimating}>Estimating…</Text>
          ) : (
            <Text style={styles.kcalValue}>{kcal != null ? `${kcal} kcal` : '—'}</Text>
          )}
        </View>

        <ActivityLogExercisesSection exercises={exercises} onChange={setExercises} />
      </ScrollView>

      {isDirty ? (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={() => void handleSave()}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <EditActivityTimeModal
        visible={timeModalVisible}
        activityLog={activityLog}
        onClose={() => setTimeModalVisible(false)}
        onSave={handleSaveActivityTime}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    zIndex: 20,
    elevation: 6,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerSpacer: {
    flex: 1,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  scroll: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  descInput: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
    minHeight: 72,
    paddingVertical: 6,
  },
  timeRow: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  timeValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  kcalRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kcalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  kcalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7c3aed',
  },
  estimating: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
    fontStyle: 'italic',
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveBtn: {
    backgroundColor: '#9810fa',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
