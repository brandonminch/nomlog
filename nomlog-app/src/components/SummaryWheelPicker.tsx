import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

type Option<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  visible: boolean;
  title: string;
  options: Option<T>[];
  selectedId: T | null;
  onSelect: (id: T) => void;
  onClose: () => void;
};

export function SummaryWheelPicker<T extends string>({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const [pendingId, setPendingId] = useState<T | null>(selectedId);

  useEffect(() => {
    if (visible) {
      setPendingId(selectedId);
    }
  }, [visible, selectedId]);

  const effectiveSelected =
    pendingId ??
    selectedId ??
    (options.length > 0 ? options[0]!.id : null);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={() => {
                if (effectiveSelected != null) {
                  onSelect(effectiveSelected);
                }
                onClose();
              }}
              style={styles.headerButton}
            >
              <Text style={[styles.headerButtonText, styles.headerButtonPrimary]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            {effectiveSelected != null && (
              <Picker
                selectedValue={effectiveSelected}
                onValueChange={(val) => {
                  setPendingId(val as T);
                }}
              >
                {options.map((opt) => (
                  <Picker.Item key={opt.id} label={opt.label} value={opt.id} />
                ))}
              </Picker>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerButtonText: {
    fontSize: 15,
    color: '#6b7280',
  },
  headerButtonPrimary: {
    color: '#111827',
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  pickerContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
});

