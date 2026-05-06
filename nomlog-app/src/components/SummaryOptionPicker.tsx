import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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

export function SummaryOptionPicker<T extends string>({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: Props<T>) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
              </View>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.option}
                  activeOpacity={0.9}
                  onPress={() => {
                    onSelect(opt.id);
                    onClose();
                  }}
                >
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {selectedId === opt.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#111827" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    paddingTop: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  optionLabel: {
    fontSize: 15,
    color: '#111827',
  },
});

