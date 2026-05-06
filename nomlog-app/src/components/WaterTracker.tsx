import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GlassWater } from 'lucide-react-native';
import { usePostHog } from 'posthog-react-native';
import { useWaterLog } from '../hooks/useWaterLog';

interface WaterTrackerProps {
  dateString: string;
}

const TOTAL_GLASSES = 8;

export const WaterTracker: React.FC<WaterTrackerProps> = ({ dateString }) => {
  const { glasses, updateGlasses, isLoading, isUpdating } = useWaterLog(dateString);
  const posthog = usePostHog();

  const handlePress = (index: number) => {
    const tappedGlass = index + 1; // 1-based glass number

    if (tappedGlass === glasses) {
      // Tapping current count decrements by 1
      const newCount = glasses - 1;
      updateGlasses(newCount);
      posthog.capture('water_tracked', { glasses: newCount, date: dateString });
    } else {
      // Otherwise set to the tapped glass number
      updateGlasses(tappedGlass);
      posthog.capture('water_tracked', { glasses: tappedGlass, date: dateString });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Water</Text>
          <ActivityIndicator size="small" color="#2196F3" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Water</Text>
        <Text style={styles.counter}>{glasses} / {TOTAL_GLASSES} glasses</Text>
      </View>
      <View style={styles.glassesRow}>
        {Array.from({ length: TOTAL_GLASSES }).map((_, index) => {
          const isFilled = index < glasses;
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.glassButton,
                isFilled ? styles.glassButtonFilled : styles.glassButtonEmpty,
              ]}
              onPress={() => handlePress(index)}
              activeOpacity={0.7}
              disabled={isUpdating}
            >
              <GlassWater
                size={20}
                color={isFilled ? '#fff' : '#2196F3'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  counter: {
    fontSize: 14,
    color: '#6a7282',
  },
  glassesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassButtonFilled: {
    backgroundColor: '#2196F3',
  },
  glassButtonEmpty: {
    backgroundColor: '#E3F2FD',
  },
});
