import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { generatePickerValues, findClosestValue } from '../utils/servingAmountPicker';

interface ServingAmountPickerProps {
  visible: boolean;
  currentAmount: number;
  unit: string;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

export const ServingAmountPicker = ({
  visible,
  currentAmount,
  unit,
  onClose,
  onConfirm,
}: ServingAmountPickerProps) => {
  const [pickerValues, setPickerValues] = useState<number[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const [backdropAnim] = useState(new Animated.Value(0));
  const [contentAnim] = useState(new Animated.Value(300));

  useEffect(() => {
    if (visible) {
      const values = generatePickerValues(unit, currentAmount);
      setPickerValues(values);
      
      const closestValue = findClosestValue(values, currentAmount);
      const index = values.indexOf(closestValue);
      setSelectedIndex(index >= 0 ? index : 0);
      
      // Animate in
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(contentAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
      
      // Scroll to selected index after a brief delay
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: index * ITEM_HEIGHT,
          animated: false,
        });
      }, 100);
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, currentAmount, unit]);

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, pickerValues.length - 1));
    setSelectedIndex(clampedIndex);
  };

  const handleScrollEnd = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, pickerValues.length - 1));
    
    scrollViewRef.current?.scrollTo({
      y: clampedIndex * ITEM_HEIGHT,
      animated: true,
    });
    
    setSelectedIndex(clampedIndex);
  };

  const handleConfirm = () => {
    if (pickerValues.length > 0 && selectedIndex >= 0 && selectedIndex < pickerValues.length) {
      onConfirm(pickerValues[selectedIndex]);
    } else if (pickerValues.length > 0) {
      // Fallback to first value if index is invalid
      onConfirm(pickerValues[0]);
    }
    onClose();
  };

  const formatValue = (value: number): string => {
    // Remove trailing zeros for whole numbers
    if (value % 1 === 0) {
      return value.toString();
    }
    // For decimals, show up to 2 decimal places but remove trailing zeros
    return parseFloat(value.toFixed(2)).toString();
  };

  const pluralizeUnit = (unit: string): string => {
    const normalized = unit.toLowerCase().trim();
    
    // Already plural or doesn't need pluralization
    if (normalized.endsWith('s') || normalized.endsWith('es')) {
      return unit; // Keep original casing
    }
    
    // Special cases
    const specialCases: Record<string, string> = {
      'sausage': 'sausages',
      'bun': 'buns',
      'slice': 'slices',
      'piece': 'pieces',
      'patty': 'patties',
      'item': 'items',
      'cup': 'cups',
      'tablespoon': 'tablespoons',
      'tbsp': 'tablespoons',
      'teaspoon': 'teaspoons',
      'tsp': 'teaspoons',
      'gram': 'grams',
      'g': 'grams',
      'ounce': 'ounces',
      'oz': 'ounces',
      'pound': 'pounds',
      'lb': 'pounds',
      'milliliter': 'milliliters',
      'ml': 'milliliters',
      'liter': 'liters',
      'l': 'liters',
      'fluid ounce': 'fluid ounces',
      'fl oz': 'fluid ounces',
    };
    
    // Check special cases (case-insensitive)
    const lowerKey = Object.keys(specialCases).find(key => 
      key.toLowerCase() === normalized
    );
    
    if (lowerKey) {
      // Preserve original casing pattern
      if (unit === unit.toUpperCase()) {
        return specialCases[lowerKey].toUpperCase();
      } else if (unit[0] === unit[0].toUpperCase()) {
        return specialCases[lowerKey].charAt(0).toUpperCase() + specialCases[lowerKey].slice(1);
      }
      return specialCases[lowerKey];
    }
    
    // Default: just add 's'
    return unit + 's';
  };

  if (Platform.OS === 'android') {
    // Android: Simple modal with scrollable list
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.androidContainer}>
          <TouchableOpacity
            style={styles.androidBackdrop}
            activeOpacity={1}
            onPress={onClose}
          />
          <View style={styles.androidContent}>
            <View style={styles.androidHeader}>
              <TouchableOpacity onPress={onClose} style={styles.androidCancelButton}>
                <Text style={styles.androidCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.androidTitle}>Select Amount</Text>
              <TouchableOpacity onPress={handleConfirm} style={styles.androidDoneButton}>
                <Text style={styles.androidDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.androidPickerContainer}>
              <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScrollEnd}
                scrollEventThrottle={16}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                nestedScrollEnabled={true}
              >
                {pickerValues.map((value, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.pickerItem,
                      index === selectedIndex && styles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedIndex(index);
                      scrollViewRef.current?.scrollTo({
                        y: index * ITEM_HEIGHT,
                        animated: true,
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        index === selectedIndex && styles.pickerItemTextSelected,
                      ]}
                    >
                      {formatValue(value)} {pluralizeUnit(unit)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // iOS: Bottom sheet style matching date picker
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
        <View style={styles.iosContainer}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          >
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { opacity: backdropAnim, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
              ]}
            />
          </TouchableOpacity>
          <View style={styles.iosContentWrapper}>
          <Animated.View
            style={[
              styles.iosContent,
              { transform: [{ translateY: contentAnim }] },
            ]}
          >
            <View style={styles.iosHeader}>
              <TouchableOpacity onPress={onClose} style={styles.iosCancelButton}>
                <Text style={styles.iosCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.iosTitle}>Select Amount</Text>
              <TouchableOpacity onPress={handleConfirm} style={styles.iosDoneButton}>
                <Text style={styles.iosDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerSelectionIndicator} />
              <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScrollEnd}
                scrollEventThrottle={16}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                bounces={true}
                alwaysBounceVertical={true}
              >
                {pickerValues.map((value, index) => (
                  <View key={index} style={styles.pickerItem}>
                    <Text
                      style={[
                        styles.pickerItemText,
                        index === selectedIndex && styles.pickerItemTextSelected,
                      ]}
                    >
                      {formatValue(value)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.unitLabel} pointerEvents="none">
                <Text style={styles.unitLabelText}>{pluralizeUnit(unit)}</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  androidContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  androidContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '80%',
    maxHeight: '60%',
    overflow: 'hidden',
  },
  androidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  androidTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  androidCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  androidCancelText: {
    fontSize: 16,
    color: '#6a7282',
  },
  androidDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  androidDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  androidPickerContainer: {
    height: 300,
  },
  iosContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosContentWrapper: {
    width: '100%',
  },
  iosContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  iosTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  iosCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosCancelText: {
    fontSize: 16,
    color: '#6a7282',
  },
  iosDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  pickerContainer: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    position: 'relative',
    marginVertical: 20,
    overflow: 'hidden',
  },
  pickerSelectionIndicator: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  scrollView: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
  },
  scrollContent: {
    paddingTop: ITEM_HEIGHT * 2,
    paddingBottom: ITEM_HEIGHT * 2,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  pickerItemText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '400',
  },
  pickerItemTextSelected: {
    color: '#101828',
    fontWeight: '600',
  },
  unitLabel: {
    position: 'absolute',
    right: 40,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    zIndex: 2,
  },
  unitLabelText: {
    fontSize: 20,
    color: '#6a7282',
    fontWeight: '500',
  },
});

