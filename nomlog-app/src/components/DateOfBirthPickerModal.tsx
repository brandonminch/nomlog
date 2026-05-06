import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props = {
  visible: boolean;
  /** YYYY-MM-DD */
  initialIso: string;
  onClose: () => void;
  /** Called with YYYY-MM-DD when user confirms */
  onConfirm: (iso: string) => void;
};

function isoToLocalDate(iso: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const x = new Date();
  x.setFullYear(x.getFullYear() - 25);
  return x;
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DateOfBirthPickerModal: React.FC<Props> = ({
  visible,
  initialIso,
  onClose,
  onConfirm,
}) => {
  const [draft, setDraft] = useState(initialIso);

  useEffect(() => {
    if (visible) {
      setDraft(initialIso && /^\d{4}-\d{2}-\d{2}$/.test(initialIso) ? initialIso : '');
    }
  }, [visible, initialIso]);

  const pickerValue = useMemo(() => isoToLocalDate(draft), [draft]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Date of birth</Text>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              if (d) setDraft(dateToIso(d));
            }}
            maximumDate={new Date()}
            minimumDate={new Date(1920, 0, 1)}
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.actionBtn} activeOpacity={0.85}>
              <Text style={styles.actionCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft)) return;
                onConfirm(draft);
                onClose();
              }}
              style={[styles.actionBtn, styles.actionPrimary]}
              activeOpacity={0.85}
            >
              <Text style={styles.actionPrimaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  actionPrimary: {
    backgroundColor: '#111827',
  },
  actionCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  actionPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
