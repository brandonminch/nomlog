import React, { useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { ActivityExerciseSegment } from '../types/activityLog';
import { sharedStyles } from './mealDetailShared';
import {
  activitySchemaTypeOptions,
  inferActivitySchemaTypeFromText,
  schemaMinimumHint,
  schemaTypeLabel,
} from '../utils/activityValidation';
import { ChevronDown } from 'lucide-react-native';

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function formatRange(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  try {
    const a = start ? new Date(start) : null;
    const b = end ? new Date(end) : null;
    if (a && b) {
      return `${a.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${b.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
    if (a) return a.toLocaleString();
    return b ? b.toLocaleString() : null;
  } catch {
    return [start, end].filter(Boolean).join(' – ');
  }
}

type Props = {
  exercises: ActivityExerciseSegment[];
  onChange: (next: ActivityExerciseSegment[]) => void;
};

export function ActivityLogExercisesSection({ exercises, onChange }: Props) {
  const updateAt = useCallback(
    (index: number, seg: ActivityExerciseSegment) => {
      const next = [...exercises];
      next[index] = seg;
      onChange(next);
    },
    [exercises, onChange]
  );

  const setWorkoutTypeForSegment = useCallback(
    (index: number, seg: Extract<ActivityExerciseSegment, { kind: 'manual_exercise' }>, schemaType: typeof activitySchemaTypeOptions[number]) => {
      if (schemaType === 'strength') {
        updateAt(index, {
          ...seg,
          schemaType,
          sets: seg.sets && seg.sets.length > 0 ? seg.sets : [{}],
        });
        return;
      }
      updateAt(index, {
        ...seg,
        schemaType,
      });
    },
    [updateAt]
  );

  const openWorkoutTypePicker = useCallback(
    (index: number, seg: Extract<ActivityExerciseSegment, { kind: 'manual_exercise' }>) => {
      const options = activitySchemaTypeOptions.map((schemaType) => ({
        text: schemaTypeLabel(schemaType),
        onPress: () => setWorkoutTypeForSegment(index, seg, schemaType),
      }));
      Alert.alert('Select workout type', undefined, [
        ...options,
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [setWorkoutTypeForSegment]
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>EXERCISES</Text>
      <View style={sharedStyles.listCard}>
        {exercises.map((seg, idx) => {
          const isLast = idx === exercises.length - 1;
          if (seg.kind === 'healthkit_workout_segment') {
            return (
              <View
                key={idx}
                style={[sharedStyles.listRow, styles.block, isLast && sharedStyles.listRowLast]}
              >
                <Text style={styles.badge}>Apple Health</Text>
                <Text style={styles.roTitle}>{seg.activityType}</Text>
                {formatRange(seg.start, seg.end) ? (
                  <Text style={styles.roMeta}>{formatRange(seg.start, seg.end)}</Text>
                ) : null}
                {seg.energyKcal != null && seg.energyKcal > 0 ? (
                  <Text style={styles.roMeta}>{Math.round(seg.energyKcal)} kcal (device)</Text>
                ) : null}
              </View>
            );
          }
          if (seg.kind === 'healthkit_quantity') {
            return (
              <View
                key={idx}
                style={[sharedStyles.listRow, styles.block, isLast && sharedStyles.listRowLast]}
              >
                <Text style={styles.badge}>Apple Health</Text>
                <Text style={styles.roTitle}>
                  {seg.quantityType}: {seg.value} {seg.unit}
                </Text>
                <Text style={styles.roMeta}>{formatRange(seg.start, seg.end)}</Text>
              </View>
            );
          }

          const sets = seg.sets ?? [];
          const hasSets = sets.length > 0;
          const schemaType = seg.schemaType ?? inferActivitySchemaTypeFromText(seg.title || '');
          const showDistanceDuration =
            schemaType === 'running' ||
            schemaType === 'walking' ||
            schemaType === 'cycling' ||
            schemaType === 'swimming' ||
            schemaType === 'hiit' ||
            schemaType === 'custom';
          const showStrengthMetrics = schemaType === 'strength' || schemaType === 'custom';
          const durationMin =
            seg.durationSec != null && seg.durationSec > 0
              ? Math.round(seg.durationSec / 60)
              : undefined;

          return (
            <View
              key={idx}
              style={[sharedStyles.listRow, styles.block, isLast && sharedStyles.listRowLast]}
            >
              <Text style={styles.badge}>Manual</Text>
              <TextInput
                style={styles.titleInput}
                value={seg.title}
                onChangeText={(title) => updateAt(idx, { ...seg, title })}
                placeholder="Exercise name"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.fieldLabel}>Workout type</Text>
              <TouchableOpacity
                style={styles.selectTrigger}
                onPress={() => openWorkoutTypePicker(idx, seg)}
                activeOpacity={0.75}
              >
                <Text style={styles.selectTriggerText}>{schemaTypeLabel(schemaType)}</Text>
                <ChevronDown size={16} color="#6b7280" strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Effort (optional)</Text>
              <View style={styles.choiceRow}>
                {(['easy', 'hard', 'intense'] as const).map((option) => {
                  const selected = seg.effort === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.choiceChip, selected && styles.choiceChipActive]}
                      onPress={() =>
                        updateAt(idx, {
                          ...seg,
                          effort: selected ? undefined : option,
                        })
                      }
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.editHint}>{schemaMinimumHint(schemaType)}</Text>
              {showDistanceDuration ? (
                <View style={styles.rowPair}>
                  <View style={styles.halfField}>
                    <Text style={styles.fieldLabel}>Distance (mi)</Text>
                    <TextInput
                      style={styles.numberInput}
                      keyboardType="decimal-pad"
                      value={seg.distanceMiles != null ? String(seg.distanceMiles) : ''}
                      onChangeText={(t) =>
                        updateAt(idx, {
                          ...seg,
                          distanceMiles: parseOptionalNumber(t),
                        })
                      }
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.fieldLabel}>Duration (min)</Text>
                    <TextInput
                      style={styles.numberInput}
                      keyboardType="decimal-pad"
                      value={durationMin != null ? String(durationMin) : ''}
                      onChangeText={(t) => {
                        const m = parseOptionalNumber(t);
                        updateAt(idx, {
                          ...seg,
                          durationSec:
                            m != null && m > 0 ? Math.round(m * 60) : undefined,
                        });
                      }}
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="decimal-pad"
                    value={durationMin != null ? String(durationMin) : ''}
                    onChangeText={(t) => {
                      const m = parseOptionalNumber(t);
                      updateAt(idx, {
                        ...seg,
                        durationSec:
                          m != null && m > 0 ? Math.round(m * 60) : undefined,
                      });
                    }}
                    placeholder="—"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              )}

              {showStrengthMetrics && !hasSets && seg.reps != null ? (
                <View style={styles.legacyReps}>
                  <Text style={styles.fieldLabel}>Reps (legacy)</Text>
                  <TextInput
                    style={styles.numberInput}
                    keyboardType="number-pad"
                    value={seg.reps != null ? String(seg.reps) : ''}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/\D/g, '');
                      if (!cleaned) {
                        updateAt(idx, { ...seg, reps: undefined });
                        return;
                      }
                      const r = Number.parseInt(cleaned, 10);
                      updateAt(idx, {
                        ...seg,
                        reps: Number.isFinite(r) ? r : undefined,
                      });
                    }}
                    placeholder="—"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              ) : null}

              {showStrengthMetrics && hasSets ? (
                <>
                  <Text style={[styles.editHint, styles.setsHint]}>
                    Sets — reps and weight are optional.
                  </Text>
                  {sets.map((set, sIdx) => (
                    <View key={sIdx} style={styles.setRow}>
                      <Text style={styles.setLabel}>Set {sIdx + 1}</Text>
                      <TextInput
                        style={styles.setField}
                        keyboardType="number-pad"
                        value={set.reps != null ? String(set.reps) : ''}
                        onChangeText={(t) => {
                          const nextSets = [...sets];
                          const cleaned = t.replace(/\D/g, '');
                          if (!cleaned) {
                            nextSets[sIdx] = { ...set, reps: undefined };
                          } else {
                            const reps = Number.parseInt(cleaned, 10);
                            nextSets[sIdx] = {
                              ...set,
                              reps: Number.isFinite(reps) ? reps : undefined,
                            };
                          }
                          updateAt(idx, { ...seg, sets: nextSets });
                        }}
                        placeholder="reps"
                        placeholderTextColor="#9ca3af"
                      />
                      <TextInput
                        style={styles.setField}
                        keyboardType="decimal-pad"
                        value={set.weightLbs != null ? String(set.weightLbs) : ''}
                        onChangeText={(t) => {
                          const nextSets = [...sets];
                          nextSets[sIdx] = {
                            ...set,
                            weightLbs: parseOptionalNumber(t),
                          };
                          updateAt(idx, { ...seg, sets: nextSets });
                        }}
                        placeholder="lb"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  ))}
                </>
              ) : null}

              {showStrengthMetrics ? (
                <TouchableOpacity
                  style={styles.addSetBtn}
                  onPress={() => {
                    const nextSets = [...sets, {}];
                    updateAt(idx, { ...seg, sets: nextSets });
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add set"
                >
                  <Text style={styles.addSetBtnText}>+ Add set</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  block: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 12,
    gap: 8,
  },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9810fa',
  },
  roTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  roMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  editHint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
  },
  setsHint: {
    marginTop: 8,
  },
  rowPair: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#111827',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  choiceChipActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  choiceChipText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
  },
  choiceChipTextActive: {
    color: '#5b21b6',
    fontWeight: '700',
  },
  selectTrigger: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectTriggerText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },
  legacyReps: {
    marginTop: 4,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  setLabel: {
    width: 52,
    fontSize: 13,
    color: '#6b7280',
  },
  setField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111827',
  },
  addSetBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addSetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9810fa',
  },
});
