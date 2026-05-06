import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { ChevronRight, MessageSquare, Star } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLlmUsage } from '../hooks/useLlmUsage';
import { useOnboardingFlow } from '../hooks/useOnboardingFlow';
import { useOnboardingMutations } from '../hooks/useOnboardingMutations';
import { ProfileReviewSummary } from '../components/OnboardingReviewSummary';
import { UsageWidget } from '../components/UsageWidget';
import { SummaryWheelPicker } from '../components/SummaryWheelPicker';
import { DateOfBirthPickerModal } from '../components/DateOfBirthPickerModal';
import { patchWithOptionalNutritionRecalc } from '../lib/nutritionRecalcPrompt';
import { useAutoLogHealthWorkouts } from '../hooks/useAutoLogHealthWorkouts';
import { ensureLocalNotificationPermission } from '../services/localNotifications';
/** Bottom inset for tab pill + chat FAB overlap (aligned with LogsScreen meals section). */
const TAB_BAR_SCROLL_PADDING = 120 + 32;

const SENTRY_FEEDBACK_ENABLED = !!process.env.EXPO_PUBLIC_SENTRY_DSN;

export const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuthStore();
  const { data: profile } = useUserProfile();
  const { data: usage, isLoading: isUsageLoading } = useLlmUsage();
  const router = useRouter();
  const posthog = usePostHog();
  const { autoLogHealthWorkouts, setAutoLogHealthWorkouts, ready: autoLogReady } =
    useAutoLogHealthWorkouts();
  const { patchProfile, patchProfileAsync, patchStats } = useOnboardingMutations();

  const {
    preferredName,
    selectedGoal,
    dateOfBirthIso,
    height,
    weight,
    biologicalSex,
    activityLevel,
    isSavingProfile,
    isSavingStats,
    setPreferredName,
    setDateOfBirthIso,
    setHeight,
    setWeight,
    setSelectedGoal,
    setBiologicalSex,
    setActivityLevel,
  } = useOnboardingFlow(profile ?? null);

  const [editingSummaryField, setEditingSummaryField] = useState<
    'name' | 'age' | 'height' | 'weight' | null
  >(null);

  const [pickerField, setPickerField] = useState<
    'goal' | 'sex' | 'activity' | 'age' | 'height' | 'weight' | null
  >(null);

  const handleSignOut = async () => {
    posthog.capture('user_signed_out');
    posthog.reset();
    await signOut();
    router.replace('/(auth)');
  };

  const handleShareFeedback = () => {
    posthog.capture('share_feedback_opened');
    Sentry.showFeedbackWidget();
  };

  const goalLabel = useMemo(() => {
    if (!selectedGoal) return null;
    const goalMap: Record<string, string> = {
      lose_weight: 'Lose weight',
      maintain_weight: 'Maintain weight',
      build_muscle: 'Build muscle',
      track_intake: 'Track my intake',
      training_event: 'Training for an event',
    };
    return goalMap[selectedGoal] ?? null;
  }, [selectedGoal]);

  const memberSinceLabel = useMemo(() => {
    if (!profile?.created_at) return null;
    const date = new Date(profile.created_at);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [profile?.created_at]);

  const heightUnit = profile?.preferred_height_unit ?? 'ft_in';
  const weightUnit = profile?.preferred_weight_unit ?? 'lbs';

  const heightOptions = useMemo(() => {
    if (heightUnit === 'cm') {
      const opts = [];
      for (let cm = 140; cm <= 210; cm += 1) {
        const label = `${cm} cm`;
        opts.push({ id: label, label });
      }
      return opts;
    }

    const opts = [];
    for (let totalInches = 48; totalInches <= 84; totalInches += 1) {
      const feet = Math.floor(totalInches / 12);
      const inches = totalInches - feet * 12;
      const label = `${feet}'${inches}"`;
      opts.push({ id: label, label });
    }
    return opts;
  }, [heightUnit]);

  const weightOptions = useMemo(() => {
    if (weightUnit === 'kg') {
      const opts = [];
      for (let kg = 40; kg <= 200; kg += 1) {
        const label = `${kg} kg`;
        opts.push({ id: label, label });
      }
      return opts;
    }

    const opts = [];
    for (let lbs = 80; lbs <= 400; lbs += 5) {
      const label = `${lbs} lbs`;
      opts.push({ id: label, label });
    }
    return opts;
  }, [weightUnit]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + TAB_BAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerRightPlaceholder} />
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {(profile?.display_name || user?.email || 'N').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileTextBlock}>
            <Text style={styles.profileName}>{profile?.display_name || 'Your name'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            {memberSinceLabel && (
              <Text style={styles.memberSince}>Member since {memberSinceLabel}</Text>
            )}
          </View>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Usage</Text>
          <UsageWidget usage={usage} isLoading={isUsageLoading} />
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <TouchableOpacity
            style={styles.dailyGoalsCard}
            activeOpacity={0.85}
            onPress={() => router.push('/edit-daily-goals')}
          >
            <View style={styles.dailyGoalsCardHeader}>
              <Text style={styles.dailyGoalsEditHint}>Tap to edit</Text>
              <ChevronRight size={18} color="#9ca3af" strokeWidth={2} />
            </View>
            <View style={styles.dailyGoalRow}>
              <Text style={styles.dailyGoalLabel}>Calories</Text>
              <Text style={styles.dailyGoalValue}>
                {profile?.daily_calorie_goal ?? 0} kcal
              </Text>
            </View>
            <View style={styles.dailyGoalRow}>
              <Text style={styles.dailyGoalLabel}>Protein</Text>
              <Text style={styles.dailyGoalValue}>
                {profile?.daily_protein_goal ?? 0}g
              </Text>
            </View>
            <View style={styles.dailyGoalRow}>
              <Text style={styles.dailyGoalLabel}>Carbs</Text>
              <Text style={styles.dailyGoalValue}>
                {profile?.daily_carb_goal ?? 0}g
              </Text>
            </View>
            <View style={styles.dailyGoalRow}>
              <Text style={styles.dailyGoalLabel}>Fat</Text>
              <Text style={styles.dailyGoalValue}>
                {profile?.daily_fat_goal ?? 0}g
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Meals</Text>
          <TouchableOpacity
            style={styles.navRowCard}
            onPress={() => router.push('/favorite-meals')}
            activeOpacity={0.85}
          >
            <View style={styles.navRowLeft}>
              <Star size={20} color="#9810fa" strokeWidth={2} fill="#f3e8ff" />
              <Text style={styles.navRowLabel}>Favorite meals</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {Platform.OS === 'ios' ? (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Apple Health</Text>
            <View style={styles.appleHealthCard}>
              <View style={styles.appleHealthTextBlock}>
                <Text style={styles.appleHealthTitle}>Log workouts automatically</Text>
                <Text style={styles.appleHealthSub}>
                  Adds workouts from the last 72 hours when you open Nomlog and when Apple Health
                  updates. You can still import manually from the activity logger.
                </Text>
              </View>
              <Switch
                value={autoLogHealthWorkouts}
                disabled={!autoLogReady}
                onValueChange={async (v) => {
                  if (v) {
                    // Local notification for background auto-logged activities.
                    await ensureLocalNotificationPermission();
                  }
                  await setAutoLogHealthWorkouts(v);
                  posthog.capture('health_auto_log_toggled', { enabled: v });
                }}
                trackColor={{ false: '#e5e7eb', true: '#d8b4fe' }}
                thumbColor={autoLogHealthWorkouts ? '#9810fa' : '#f4f4f5'}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.summarySection}>
          <ProfileReviewSummary
            profile={profile}
            preferredName={preferredName}
            goalLabel={goalLabel}
            biologicalSex={biologicalSex}
            activityLevel={activityLevel}
            dateOfBirthIso={dateOfBirthIso}
            heightInput={height}
            weightInput={weight}
            editingField={editingSummaryField}
            isSavingProfile={isSavingProfile}
            isSavingStats={isSavingStats}
            onStartEdit={(field) => {
              setEditingSummaryField(field);
            }}
            onSubmitEdit={async (field, value) => {
              setEditingSummaryField(null);

              if (field === 'name') {
                const trimmed = value.trim();
                setPreferredName(trimmed);
                await patchProfile({ display_name: trimmed || null });
              } else if (field === 'age') {
                const iso = value.trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
                setDateOfBirthIso(iso);
                await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
                  patchStats({ date_of_birth: iso, recalculate_nutrition_targets: recalc })
                );
              } else if (field === 'height') {
                setHeight(value);
                await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
                  patchStats({ height_input: value, recalculate_nutrition_targets: recalc })
                );
              } else if (field === 'weight') {
                setWeight(value);
                await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
                  patchStats({ weight_input: value, recalculate_nutrition_targets: recalc })
                );
              }
            }}
            onCancelEdit={() => {
              setEditingSummaryField(null);
            }}
            onStartSelectEdit={(field) => {
              setPickerField(field);
              setEditingSummaryField(null);
            }}
            onComplete={async () => {
              // No global submit action in profile view; each field saves immediately.
            }}
            showIntroText={false}
            showPrimaryCta={false}
          />
        </View>

        {SENTRY_FEEDBACK_ENABLED && (
          <View style={styles.summarySection}>
            <TouchableOpacity
              style={styles.navRowCard}
              onPress={handleShareFeedback}
              activeOpacity={0.85}
            >
              <View style={styles.navRowLeft}>
                <MessageSquare size={20} color="#9810fa" strokeWidth={2} />
                <Text style={styles.navRowLabel}>Share feedback</Text>
              </View>
              <ChevronRight size={20} color="#9ca3af" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut} activeOpacity={0.9}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        {/* Debug tools can be rendered here when needed. */}
      </ScrollView>

      <DateOfBirthPickerModal
        visible={pickerField === 'age'}
        initialIso={dateOfBirthIso || profile?.date_of_birth || ''}
        onClose={() => setPickerField(null)}
        onConfirm={async (iso) => {
          setDateOfBirthIso(iso);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ date_of_birth: iso, recalculate_nutrition_targets: recalc })
          );
        }}
      />
      <SummaryWheelPicker
        visible={pickerField === 'height'}
        title="Select height"
        options={heightOptions}
        selectedId={heightOptions.find((opt) => opt.id === height.trim())?.id ?? null}
        onSelect={async (id) => {
          setHeight(id);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ height_input: id, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'weight'}
        title="Select weight"
        options={weightOptions}
        selectedId={weightOptions.find((opt) => opt.id === weight.trim())?.id ?? null}
        onSelect={async (id) => {
          setWeight(id);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ weight_input: id, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'goal'}
        title="Select goal"
        options={[
          { id: 'lose_weight', label: 'Lose weight' },
          { id: 'maintain_weight', label: 'Maintain weight' },
          { id: 'build_muscle', label: 'Build muscle' },
          { id: 'track_intake', label: 'Track my intake' },
          { id: 'training_event', label: 'Training for an event' },
        ]}
        selectedId={selectedGoal}
        onSelect={async (id) => {
          setSelectedGoal(id as any);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchProfileAsync({ primary_goal: id as any, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'sex'}
        title="Select biological sex"
        options={[
          { id: 'male', label: 'Male' },
          { id: 'female', label: 'Female' },
          { id: 'prefer_not_to_say', label: 'Prefer not to say' },
        ]}
        selectedId={biologicalSex}
        onSelect={async (id) => {
          setBiologicalSex(id as any);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchProfileAsync({ biological_sex: id as any, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'activity'}
        title="Select activity level"
        options={[
          { id: 'sedentary', label: 'Sedentary' },
          { id: 'lightly_active', label: 'Lightly active' },
          { id: 'moderately_active', label: 'Moderately active' },
          { id: 'very_active', label: 'Very active' },
          { id: 'extremely_active', label: 'Extra active' },
        ]}
        selectedId={activityLevel}
        onSelect={async (id) => {
          setActivityLevel(id as any);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchProfileAsync({ activity_level: id as any, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#101828',
  },
  headerRightPlaceholder: {
    width: 32,
  },
  profileCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '600',
  },
  profileTextBlock: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#4a5565',
    marginBottom: 2,
  },
  memberSince: {
    fontSize: 12,
    color: '#6a7282',
  },
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#101828',
    marginBottom: 12,
  },
  dailyGoalsCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dailyGoalsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dailyGoalsEditHint: {
    fontSize: 13,
    color: '#6a7282',
  },
  dailyGoalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dailyGoalLabel: {
    fontSize: 14,
    color: '#364153',
  },
  dailyGoalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
  },
  appleHealthCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  appleHealthTextBlock: {
    flex: 1,
  },
  appleHealthTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 6,
  },
  appleHealthSub: {
    fontSize: 13,
    color: '#6a7282',
    lineHeight: 18,
  },
  navRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  navRowCardSpacing: {
    marginTop: 10,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navRowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#101828',
  },
  logoutButton: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffc9c9',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e7000b',
  },
  debugSection: {
    marginTop: 24,
  },
});