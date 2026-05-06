import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { CheckCircle2, Pencil } from 'lucide-react-native';
import type { UserProfile } from '../hooks/useUserProfile';
import { formatDateOfBirthDisplay, getAgeYearsFromDateOfBirth } from '../lib/ageFromDateOfBirth';

type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active'
  | null;
type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say' | null;

export type ProfileReviewSummaryProps = {
  profile: UserProfile | null | undefined;
  preferredName: string;
  goalLabel: string | null;
  biologicalSex: BiologicalSex;
  activityLevel: ActivityLevel;
  /** Local or saved YYYY-MM-DD */
  dateOfBirthIso: string;
  heightInput: string;
  weightInput: string;
  editingField: 'name' | 'age' | 'height' | 'weight' | null;
  isSavingProfile: boolean;
  isSavingStats: boolean;
  onStartEdit: (field: 'name' | 'age' | 'height' | 'weight') => void;
  onSubmitEdit: (field: 'name' | 'age' | 'height' | 'weight', value: string) => Promise<void> | void;
  onCancelEdit: () => void;
  onStartSelectEdit: (field: 'goal' | 'sex' | 'activity' | 'age' | 'height' | 'weight') => void;
  onComplete: () => void;
  /**
   * Control whether to show the intro helper text above the summary list.
   * In onboarding this is true; in the profile screen this should be false.
   */
  showIntroText?: boolean;
  /**
   * Control whether to show the primary CTA button below the list.
   * In onboarding this is true; in the profile screen this should be false.
   */
  showPrimaryCta?: boolean;
};

export const ProfileReviewSummary: React.FC<ProfileReviewSummaryProps> = ({
  profile,
  preferredName,
  goalLabel,
  biologicalSex,
  activityLevel,
  dateOfBirthIso,
  heightInput,
  weightInput,
  editingField,
  isSavingProfile,
  isSavingStats,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onStartSelectEdit,
  onComplete,
  showIntroText = true,
  showPrimaryCta = true,
}) => {
  const [draftName, setDraftName] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [draftWeight, setDraftWeight] = useState('');

  useEffect(() => {
    if (editingField === 'name') {
      setDraftName(profile?.display_name || preferredName || '');
    } else if (editingField === 'height') {
      if (profile?.height_cm != null) {
        if (profile.preferred_height_unit === 'ft_in') {
          const totalInches = profile.height_cm / 2.54;
          const feet = Math.floor(totalInches / 12);
          const inches = Math.round(totalInches - feet * 12);
          setDraftHeight(`${feet}'${inches}"`);
        } else {
          setDraftHeight(`${Math.round(profile.height_cm)} cm`);
        }
      } else {
        setDraftHeight('');
      }
    } else if (editingField === 'weight') {
      if (profile?.weight_kg != null) {
        if (profile.preferred_weight_unit === 'lbs') {
          const lbs = profile.weight_kg / 0.45359237;
          setDraftWeight(`${Math.round(lbs)} lbs`);
        } else {
          setDraftWeight(`${Math.round(profile.weight_kg)} kg`);
        }
      } else {
        setDraftWeight('');
      }
    }
  }, [editingField, profile?.display_name, preferredName, profile?.height_cm, profile?.preferred_height_unit, profile?.weight_kg, profile?.preferred_weight_unit]);

  const isSaving = isSavingProfile || isSavingStats;

  const summaryHeightText = useMemo(() => {
    if (profile?.height_cm == null) return null;
    if (profile.preferred_height_unit === 'ft_in') {
      const totalInches = profile.height_cm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches - feet * 12);
      return `${feet}'${inches}"`;
    }
    return `${Math.round(profile.height_cm)} cm`;
  }, [profile?.height_cm, profile?.preferred_height_unit]);

  const summaryWeightText = useMemo(() => {
    if (profile?.weight_kg == null) return null;
    if (profile.preferred_weight_unit === 'lbs') {
      const lbs = profile.weight_kg / 0.45359237;
      return `${Math.round(lbs)} lbs`;
    }
    return `${Math.round(profile.weight_kg)} kg`;
  }, [profile?.weight_kg, profile?.preferred_weight_unit]);

  const activityLabel =
    activityLevel === 'sedentary'
      ? 'Sedentary'
      : activityLevel === 'lightly_active'
        ? 'Lightly active'
        : activityLevel === 'moderately_active'
          ? 'Moderately active'
          : activityLevel === 'very_active'
            ? 'Very active'
            : activityLevel === 'extremely_active'
              ? 'Extra active'
              : 'Not set';

  const sexLabel =
    biologicalSex === 'male'
      ? 'Male'
      : biologicalSex === 'female'
        ? 'Female'
        : biologicalSex === 'prefer_not_to_say'
          ? 'Prefer not to say'
          : 'Not set';

  const displayName =
    preferredName.trim() || profile?.display_name || 'Not set';

  const displayBirthday = useMemo(() => {
    const iso = dateOfBirthIso.trim() || profile?.date_of_birth || '';
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Not set';
    const tz = profile?.timezone ?? 'UTC';
    try {
      const age = getAgeYearsFromDateOfBirth(iso, new Date(), tz);
      return `${formatDateOfBirthDisplay(iso)} (age ${age})`;
    } catch {
      return formatDateOfBirthDisplay(iso);
    }
  }, [dateOfBirthIso, profile?.date_of_birth, profile?.timezone]);

  const displayHeight = heightInput.trim() || summaryHeightText || 'Not set';

  const displayWeight = weightInput.trim() || summaryWeightText || 'Not set';

  return (
    <>
      {showIntroText && (
        <View style={styles.botTextBlock}>
          <Text style={styles.botText}>
            {"Here's a quick summary of what you've told me so far. You can tap any of these to change your answer."}
          </Text>
        </View>
      )}

      <View style={styles.reviewList}>
        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartEdit('name');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Name</Text>
              {editingField === 'name' ? (
                <TextInput
                  style={styles.inlineInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  editable={!isSaving}
                  autoFocus={editingField === 'name'}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (!isSaving) onSubmitEdit('name', draftName);
                  }}
                  onBlur={() => {
                    if (!isSaving) onCancelEdit();
                  }}
                  blurOnSubmit
                />
              ) : (
                <Text style={styles.goalDescription}>{displayName}</Text>
              )}
            </View>
            {editingField === 'name' ? (
              <TouchableOpacity
                onPress={() => {
                  if (!isSaving) onSubmitEdit('name', draftName);
                }}
                disabled={isSaving}
              >
                <CheckCircle2 size={18} color="#111827" />
              </TouchableOpacity>
            ) : (
              <Pencil size={18} color="#9CA3AF" />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('goal');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Goal</Text>
              <Text style={styles.goalDescription}>{goalLabel || 'Not set'}</Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('age');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Birthday</Text>
              <Text style={styles.goalDescription}>
                {displayBirthday}
              </Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('height');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Height</Text>
              <Text style={styles.goalDescription}>{displayHeight}</Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('weight');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Weight</Text>
              <Text style={styles.goalDescription}>{displayWeight}</Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('sex');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Biological sex</Text>
              <Text style={styles.goalDescription}>{sexLabel}</Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.goalOption}
          activeOpacity={0.9}
          onPress={() => {
            if (!isSaving) onStartSelectEdit('activity');
          }}
        >
          <View style={styles.goalRow}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>Activity level</Text>
              <Text style={styles.goalDescription}>{activityLabel}</Text>
            </View>
            <Pencil size={18} color="#9CA3AF" />
          </View>
        </TouchableOpacity>
      </View>

      {showPrimaryCta && (
        <TouchableOpacity
          style={styles.primaryCta}
          activeOpacity={0.9}
          onPress={async () => {
            if (editingField === 'name') {
              await onSubmitEdit('name', draftName);
            } else if (editingField === 'height') {
              await onSubmitEdit('height', draftHeight);
            } else if (editingField === 'weight') {
              await onSubmitEdit('weight', draftWeight);
            }
            onComplete();
          }}
        >
          <Text style={styles.primaryCtaText}>Looks good!</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

// Backwards-compatible wrapper used by the onboarding flow.
// This keeps existing imports working while allowing the same summary
// presentation to be reused in the profile screen with different chrome.
export const OnboardingReviewSummary: React.FC<ProfileReviewSummaryProps> = (props) => {
  return <ProfileReviewSummary {...props} showIntroText showPrimaryCta />;
};

const styles = StyleSheet.create({
  botTextBlock: {
    paddingRight: 32,
  },
  botText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  reviewList: {
    marginTop: 24,
    gap: 8,
  },
  primaryCta: {
    marginTop: 24,
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  goalOption: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalText: {
    flex: 1,
    paddingRight: 12,
  },
  goalLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6b7280',
    marginBottom: 4,
  },
  goalDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  inlineInput: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
    padding: 0,
    margin: 0,
  },
});

