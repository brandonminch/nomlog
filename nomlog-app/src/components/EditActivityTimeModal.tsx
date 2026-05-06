import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMealDate } from '../utils/dateFormat';
import type { ActivityLog } from '../types/activityLog';

interface EditActivityTimeModalProps {
  visible: boolean;
  activityLog: ActivityLog | null;
  onClose: () => void;
  onSave: (activityLogId: string, newDate: Date) => Promise<void>;
}

export const EditActivityTimeModal = ({
  visible,
  activityLog,
  onClose,
  onSave,
}: EditActivityTimeModalProps) => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const mainModalBackdropAnim = useRef(new Animated.Value(0)).current;
  const mainModalContentAnim = useRef(new Animated.Value(300)).current;
  const datePickerBackdropAnim = useRef(new Animated.Value(0)).current;
  const datePickerContentAnim = useRef(new Animated.Value(300)).current;

  React.useEffect(() => {
    if (visible && activityLog) {
      setSelectedDate(new Date(activityLog.logged_at));
      setShowDatePicker(false);
    }
  }, [visible, activityLog]);

  useEffect(() => {
    if (visible) {
      Animated.timing(mainModalBackdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(mainModalContentAnim, {
        toValue: 0,
        duration: 300,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(mainModalContentAnim, {
        toValue: 300,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(mainModalBackdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [visible, mainModalBackdropAnim, mainModalContentAnim]);

  useEffect(() => {
    if (showDatePicker) {
      Animated.timing(datePickerBackdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(datePickerContentAnim, {
        toValue: 0,
        duration: 300,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(datePickerContentAnim, {
        toValue: 300,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(datePickerBackdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [showDatePicker, datePickerBackdropAnim, datePickerContentAnim]);

  const handleSave = async () => {
    if (!activityLog) return;
    setIsSaving(true);
    try {
      await onSave(activityLog.id, selectedDate);
      onClose();
    } catch (error) {
      console.error('Error saving activity time:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!activityLog) return null;

  const subtitleLine =
    activityLog.calories_burned != null && Number(activityLog.calories_burned) > 0
      ? `${Math.round(Number(activityLog.calories_burned))} kcal burned`
      : activityLog.description?.trim() || null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.modalContainer}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: mainModalBackdropAnim, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
          ]}
        />
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalContentWrapper}>
          <Animated.View
            style={[
              styles.modalContent,
              {
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: mainModalContentAnim }],
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Edit time</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#6a7282" />
              </TouchableOpacity>
            </View>

            <View style={styles.mealInfo}>
              <Text style={styles.mealName}>{activityLog.name}</Text>
              {subtitleLine ? <Text style={styles.mealDescription}>{subtitleLine}</Text> : null}
            </View>

            <View style={styles.datePickerContainer}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={styles.datePickerWidget}
                activeOpacity={0.7}
              >
                <View style={styles.datePickerTopSection}>
                  <View style={styles.datePickerTopLeft}>
                    <Ionicons name="time-outline" size={16} color="#7c3aed" />
                    <Text style={styles.datePickerQuestionText}>When was this activity?</Text>
                  </View>
                </View>
                <View style={styles.datePickerSeparator} />
                <View style={styles.datePickerBottomSection}>
                  <Text style={styles.datePickerDateText}>{formatMealDate(selectedDate)}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            >
              <Ionicons name="checkmark-circle" size={16} color="white" />
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save changes'}</Text>
            </TouchableOpacity>

            {showDatePicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={selectedDate}
                mode="datetime"
                display="default"
                maximumDate={new Date()}
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && date) {
                    setSelectedDate(date);
                  }
                }}
              />
            )}

            {Platform.OS === 'ios' && (
              <Modal
                visible={showDatePicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDatePicker(false)}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => setShowDatePicker(false)}
                  style={styles.iosPickerModalContainer}
                >
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      { opacity: datePickerBackdropAnim, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
                    ]}
                  />
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                    style={styles.iosPickerModalContentWrapper}
                  >
                    <Animated.View
                      style={[
                        styles.iosPickerModalContent,
                        { transform: [{ translateY: datePickerContentAnim }] },
                      ]}
                    >
                      <View style={styles.iosPickerHeader}>
                        <TouchableOpacity
                          onPress={() => setShowDatePicker(false)}
                          style={styles.iosPickerCancelButton}
                        >
                          <Text style={styles.iosPickerCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <Text style={styles.iosPickerTitle}>Select date and time</Text>
                        <TouchableOpacity
                          onPress={() => setShowDatePicker(false)}
                          style={styles.iosPickerDoneButton}
                        >
                          <Text style={styles.iosPickerDoneText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={selectedDate}
                        mode="datetime"
                        display="spinner"
                        maximumDate={new Date()}
                        onChange={(_event, date) => {
                          if (date) {
                            setSelectedDate(date);
                          }
                        }}
                        style={styles.iosPicker}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                </TouchableOpacity>
              </Modal>
            )}
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContentWrapper: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#101828',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealInfo: {
    marginBottom: 24,
  },
  mealName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#101828',
    marginBottom: 4,
  },
  mealDescription: {
    fontSize: 14,
    color: '#6a7282',
  },
  datePickerContainer: {
    marginBottom: 24,
  },
  datePickerWidget: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  datePickerTopSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12.691,
    paddingHorizontal: 12.691,
    paddingBottom: 7.992,
  },
  datePickerTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7.992,
  },
  datePickerQuestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#364153',
    letterSpacing: -0.1504,
  },
  datePickerSeparator: {
    borderTopWidth: 0.698,
    borderTopColor: '#f3f4f6',
  },
  datePickerBottomSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12.691,
    paddingBottom: 12.691,
  },
  datePickerDateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101828',
    letterSpacing: -0.1504,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#000',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
    letterSpacing: -0.1504,
  },
  iosPickerModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosPickerModalContentWrapper: {
    width: '100%',
  },
  iosPickerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  iosPickerCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerCancelText: {
    fontSize: 16,
    color: '#6a7282',
  },
  iosPickerDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  iosPicker: {
    height: 200,
  },
});
