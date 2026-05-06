import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserProfile } from '../src/hooks/useUserProfile';
import { useOnboardingMutations } from '../src/hooks/useOnboardingMutations';

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function EditDailyGoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useUserProfile();
  const { patchDailyGoalsAsync, isSavingDailyGoals } = useOnboardingMutations();

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setCalories(profile.daily_calorie_goal != null ? String(profile.daily_calorie_goal) : '');
    setProtein(profile.daily_protein_goal != null ? String(profile.daily_protein_goal) : '');
    setCarbs(profile.daily_carb_goal != null ? String(profile.daily_carb_goal) : '');
    setFat(profile.daily_fat_goal != null ? String(profile.daily_fat_goal) : '');
  }, [profile]);

  const onSave = async () => {
    setError(null);
    const cal = numOrNull(calories);
    const p = numOrNull(protein);
    const c = numOrNull(carbs);
    const f = numOrNull(fat);
    if (cal == null || cal <= 0) {
      setError('Enter a positive calorie goal.');
      return;
    }
    if (p == null || p < 0 || c == null || c < 0 || f == null || f < 0) {
      setError('Macro goals must be zero or greater.');
      return;
    }
    try {
      await patchDailyGoalsAsync({
        daily_calorie_goal: cal,
        daily_protein_goal: p,
        daily_carb_goal: c,
        daily_fat_goal: f,
      });
      router.back();
    } catch (e) {
      setError('Could not save. Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.header, { paddingTop: 8 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={12} activeOpacity={0.85}>
          <ChevronLeft size={24} color="#101828" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.title}>Daily goals</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          Set your daily calorie target and macros. These stay as you enter them unless you choose to recalculate from
          your profile.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.field}>
          <Text style={styles.label}>Calories (kcal)</Text>
          <TextInput
            style={styles.input}
            value={calories}
            onChangeText={setCalories}
            keyboardType="number-pad"
            placeholder="e.g. 2200"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Protein (g)</Text>
          <TextInput
            style={styles.input}
            value={protein}
            onChangeText={setProtein}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Carbs (g)</Text>
          <TextInput
            style={styles.input}
            value={carbs}
            onChangeText={setCarbs}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Fat (g)</Text>
          <TextInput
            style={styles.input}
            value={fat}
            onChangeText={setFat}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
          />
        </View>
        <TouchableOpacity
          style={[styles.save, isSavingDailyGoals && styles.saveDisabled]}
          onPress={() => void onSave()}
          disabled={isSavingDailyGoals}
          activeOpacity={0.9}
        >
          {isSavingDailyGoals ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  back: {
    padding: 8,
    width: 44,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101828',
  },
  headerSpacer: {
    width: 44,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  hint: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 20,
  },
  error: {
    color: '#b91c1c',
    marginBottom: 12,
    fontSize: 14,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#364153',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#101828',
    backgroundColor: '#f9fafb',
  },
  save: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
