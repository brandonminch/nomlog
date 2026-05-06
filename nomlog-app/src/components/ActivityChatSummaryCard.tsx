import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import type { ActivitySummary, ActivitySummaryItem } from '../types/activitySummary';
import type { ActivityEffort, ActivitySchemaType } from '../types/activityLog';
import { sharedStyles } from './mealDetailShared';
import {
  activitySchemaTypeOptions,
  inferActivitySchemaTypeFromText,
  schemaMinimumHint,
  schemaTypeLabel,
} from '../utils/activityValidation';

type Props = {
  summary: ActivitySummary;
  onSummaryChange: (next: ActivitySummary) => void;
  dateLabel: string;
  onOpenDatePicker: () => void;
  onLog: () => void;
  isLogging: boolean;
  /** Hide floating chat composer while any summary field is focused (same pattern as meal logging). */
  onSummaryFieldFocus: () => void;
  onSummaryFieldBlur: () => void;
};

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const effortOptions: ActivityEffort[] = ['easy', 'hard', 'intense'];

export function ActivityChatSummaryCard({
  summary,
  onSummaryChange,
  dateLabel,
  onOpenDatePicker,
  onLog,
  isLogging,
  onSummaryFieldFocus,
  onSummaryFieldBlur,
}: Props) {
  const [assumptionsExpanded, setAssumptionsExpanded] = useState(false);

  const updateItem = useCallback(
    (index: number, item: ActivitySummaryItem) => {
      const items = [...summary.items];
      items[index] = item;
      onSummaryChange({ ...summary, items });
    },
    [onSummaryChange, summary]
  );

  const setWorkoutTypeForItem = useCallback(
    (index: number, item: ActivitySummaryItem, schemaType: ActivitySchemaType) => {
      if (schemaType === 'strength') {
        if (item.kind === 'strength') {
          updateItem(index, { ...item, schemaType });
          return;
        }
        updateItem(index, {
          kind: 'strength',
          exerciseName: item.activityName,
          schemaType,
          effort: item.effort,
          sets: [{}],
        });
        return;
      }

      if (item.kind === 'cardio') {
        updateItem(index, { ...item, schemaType });
        return;
      }
      updateItem(index, {
        kind: 'cardio',
        activityName: item.exerciseName,
        schemaType,
        effort: item.effort,
        durationMinutes: undefined,
        distanceMiles: undefined,
        distanceKm: undefined,
      });
    },
    [updateItem]
  );

  const openWorkoutTypePicker = useCallback(
    (index: number, item: ActivitySummaryItem) => {
      const options = activitySchemaTypeOptions.map((schemaType) => ({
        text: schemaTypeLabel(schemaType),
        onPress: () => setWorkoutTypeForItem(index, item, schemaType),
      }));
      Alert.alert('Select workout type', undefined, [
        ...options,
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [setWorkoutTypeForItem]
  );

  return (
    <Pressable onPress={Keyboard.dismiss} style={styles.cardOuter}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>SESSION</Text>
        <TextInput
          style={styles.titleInput}
          value={summary.name}
          onFocus={onSummaryFieldFocus}
          onBlur={onSummaryFieldBlur}
          onChangeText={(name) => onSummaryChange({ ...summary, name })}
          placeholder="Workout name"
          placeholderTextColor="#9ca3af"
          accessibilityLabel="Activity name"
        />
        <TextInput
          style={styles.descInput}
          value={summary.description}
          onFocus={onSummaryFieldFocus}
          onBlur={onSummaryFieldBlur}
          onChangeText={(description) => onSummaryChange({ ...summary, description })}
          placeholder="Short description"
          placeholderTextColor="#9ca3af"
          multiline
          accessibilityLabel="Activity description"
        />

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>DETAILS</Text>
        <View style={sharedStyles.listCard}>
          {summary.items.map((item, idx) => {
            const isLast = idx === summary.items.length - 1;
            if (item.kind === 'cardio') {
              const schemaType: ActivitySchemaType =
                item.schemaType ?? inferActivitySchemaTypeFromText(item.activityName || '');
              return (
                <View
                  key={idx}
                  style={[sharedStyles.listRow, styles.detailBlock, isLast && sharedStyles.listRowLast]}
                >
                  <Text style={styles.itemKind}>Cardio</Text>
                  <TextInput
                    style={styles.inlineInput}
                    value={item.activityName}
                    onFocus={onSummaryFieldFocus}
                    onBlur={onSummaryFieldBlur}
                    onChangeText={(activityName) =>
                      updateItem(idx, { ...item, activityName })
                    }
                    placeholder="Activity (e.g. Run)"
                    placeholderTextColor="#9ca3af"
                  />
                  <Text style={styles.fieldLabel}>Workout type</Text>
                  <TouchableOpacity
                    style={styles.selectTrigger}
                    onPress={() => openWorkoutTypePicker(idx, item)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.selectTriggerText}>{schemaTypeLabel(schemaType)}</Text>
                    <ChevronDown size={16} color="#6b7280" strokeWidth={2} />
                  </TouchableOpacity>
                  <Text style={styles.fieldLabel}>Effort (optional)</Text>
                  <View style={styles.choiceRow}>
                    {effortOptions.map((option) => {
                      const selected = item.effort === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.choiceChip, selected && styles.choiceChipActive]}
                          onPress={() =>
                            updateItem(idx, {
                              ...item,
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
                  <View style={styles.rowPair}>
                    <View style={styles.halfField}>
                      <Text style={styles.fieldLabel}>Distance (mi)</Text>
                      <TextInput
                        style={styles.numberInput}
                        keyboardType="decimal-pad"
                        value={item.distanceMiles != null ? String(item.distanceMiles) : ''}
                        onFocus={onSummaryFieldFocus}
                        onBlur={onSummaryFieldBlur}
                        onChangeText={(t) =>
                          updateItem(idx, {
                            ...item,
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
                        value={item.durationMinutes != null ? String(item.durationMinutes) : ''}
                        onFocus={onSummaryFieldFocus}
                        onBlur={onSummaryFieldBlur}
                        onChangeText={(t) =>
                          updateItem(idx, {
                            ...item,
                            durationMinutes: parseOptionalNumber(t),
                          })
                        }
                        placeholder="—"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                </View>
              );
            }
            return (
              <View
                key={idx}
                style={[sharedStyles.listRow, styles.detailBlock, isLast && sharedStyles.listRowLast]}
              >
                <Text style={styles.itemKind}>Strength</Text>
                <TextInput
                  style={styles.inlineInput}
                  value={item.exerciseName}
                  onFocus={onSummaryFieldFocus}
                  onBlur={onSummaryFieldBlur}
                  onChangeText={(exerciseName) =>
                    updateItem(idx, { ...item, exerciseName })
                  }
                  placeholder="Exercise"
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.fieldLabel}>Workout type</Text>
                <TouchableOpacity
                  style={styles.selectTrigger}
                  onPress={() => openWorkoutTypePicker(idx, item)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.selectTriggerText}>
                    {schemaTypeLabel(item.schemaType ?? 'strength')}
                  </Text>
                  <ChevronDown size={16} color="#6b7280" strokeWidth={2} />
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Effort (optional)</Text>
                <View style={styles.choiceRow}>
                  {effortOptions.map((option) => {
                    const selected = item.effort === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.choiceChip, selected && styles.choiceChipActive]}
                        onPress={() =>
                          updateItem(idx, {
                            ...item,
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
                <Text style={styles.editHint}>{schemaMinimumHint(item.schemaType ?? 'strength')}</Text>
                {item.sets.map((set, sIdx) => (
                  <View key={sIdx} style={styles.setRow}>
                    <Text style={styles.setLabel}>Set {sIdx + 1}</Text>
                    <TextInput
                      style={styles.setField}
                      keyboardType="number-pad"
                      value={set.reps != null ? String(set.reps) : ''}
                      onFocus={onSummaryFieldFocus}
                      onBlur={onSummaryFieldBlur}
                      onChangeText={(t) => {
                        const sets = [...item.sets];
                        const cleaned = t.replace(/\D/g, '');
                        if (!cleaned) {
                          sets[sIdx] = { ...set, reps: undefined };
                        } else {
                          const reps = Number.parseInt(cleaned, 10);
                          sets[sIdx] = {
                            ...set,
                            reps: Number.isFinite(reps) ? reps : undefined,
                          };
                        }
                        updateItem(idx, { ...item, sets });
                      }}
                      placeholder="reps"
                      placeholderTextColor="#9ca3af"
                    />
                    <TextInput
                      style={styles.setField}
                      keyboardType="decimal-pad"
                      value={set.weightLbs != null ? String(set.weightLbs) : ''}
                      onFocus={onSummaryFieldFocus}
                      onBlur={onSummaryFieldBlur}
                      onChangeText={(t) => {
                        const sets = [...item.sets];
                        sets[sIdx] = {
                          ...set,
                          weightLbs: parseOptionalNumber(t),
                        };
                        updateItem(idx, { ...item, sets });
                      }}
                      placeholder="lb"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addSetBtn}
                  onPress={() =>
                    updateItem(idx, {
                      ...item,
                      sets: [...item.sets, {}],
                    })
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add set"
                >
                  <Text style={styles.addSetBtnText}>+ Add set</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {summary.assumptions && summary.assumptions.length > 0 ? (
          <View style={styles.assumptions}>
            <TouchableOpacity
              style={styles.assumptionHeader}
              onPress={() => setAssumptionsExpanded((e) => !e)}
              activeOpacity={0.7}
            >
              <Text style={styles.assumptionTitle}>Assumptions ({summary.assumptions.length})</Text>
              {assumptionsExpanded ? (
                <ChevronUp size={18} color="#6a7282" strokeWidth={2} />
              ) : (
                <ChevronDown size={18} color="#6a7282" strokeWidth={2} />
              )}
            </TouchableOpacity>
            {assumptionsExpanded
              ? summary.assumptions.map((a, i) => (
                  <Text key={i} style={styles.assumptionLine}>
                    — {a}
                  </Text>
                ))
              : null}
          </View>
        ) : null}

        <View style={styles.dateBlock}>
          <TouchableOpacity onPress={onOpenDatePicker} style={styles.dateBtn} activeOpacity={0.7}>
            <View style={styles.dateBtnTop}>
              <Ionicons name="time-outline" size={16} color="#6366f1" />
              <Text style={styles.dateQ}>When was this workout?</Text>
            </View>
            <View style={styles.dateSep} />
            <Text style={styles.dateVal}>{dateLabel}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.logBtn, isLogging && styles.logBtnDisabled]}
          onPress={() => {
            Keyboard.dismiss();
            onLog();
          }}
          disabled={isLogging}
          activeOpacity={0.85}
        >
          {isLogging ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.logBtnText}>Log activity</Text>
          )}
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    marginTop: 8,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.6,
  },
  sectionSpaced: {
    marginTop: 16,
  },
  titleInput: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  descInput: {
    marginTop: 10,
    fontSize: 15,
    color: '#374151',
    minHeight: 44,
    paddingVertical: 6,
  },
  detailBlock: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 12,
    gap: 8,
  },
  itemKind: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9810fa',
  },
  inlineInput: {
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
  editHint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
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
  assumptions: {
    marginTop: 14,
  },
  assumptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assumptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  assumptionLine: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
  },
  dateBlock: {
    marginTop: 16,
  },
  dateBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  dateBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateQ: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  dateSep: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dateVal: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  logBtn: {
    marginTop: 16,
    backgroundColor: '#9810fa',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logBtnDisabled: {
    opacity: 0.7,
  },
  logBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
