import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSuggestionTime } from '../utils/dateFormat';

type MealSuggestion = {
  id: string;
  name: string;
  description: string;
  logged_at: string;
  total_nutrition: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  } | null;
  similarity: number;
};

type MealSuggestionCardProps = {
  suggestion: MealSuggestion;
  onPress?: () => void;
};

export const MealSuggestionCard: React.FC<MealSuggestionCardProps> = ({ suggestion, onPress }) => {
  const formatNutrition = () => {
    if (!suggestion.total_nutrition) return null;
    const { calories, protein, carbohydrates, fat } = suggestion.total_nutrition;
    const cal = Math.round(calories);
    const p = Math.round(protein);
    const c = Math.round(carbohydrates);
    const f = Math.round(fat);
    return `${cal}cal P: ${p}g C: ${c}g F: ${f}g`;
  };

  const formatTime = () => {
    if (!suggestion.logged_at) return null;
    const date = new Date(suggestion.logged_at);
    return formatSuggestionTime(date);
  };

  return (
    <TouchableOpacity 
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <View style={styles.headerRow}>
          <Text style={styles.mealName} numberOfLines={1}>
            {suggestion.name}
          </Text>
          {suggestion.logged_at && (
            <View style={styles.timeContainer}>
              <Ionicons name="time-outline" size={14} color="#6a7282" />
              <Text style={styles.timeText}>{formatTime()}</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.description} numberOfLines={2}>
          {suggestion.description}
        </Text>
        
        {suggestion.total_nutrition && (
          <Text style={styles.nutrition}>
            <Text style={styles.calories}>{Math.round(suggestion.total_nutrition.calories)}cal</Text>
            {' '}P: {Math.round(suggestion.total_nutrition.protein)}g C: {Math.round(suggestion.total_nutrition.carbohydrates)}g F: {Math.round(suggestion.total_nutrition.fat)}g
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardContent: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  mealName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
    flex: 1,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#6a7282',
  },
  description: {
    fontSize: 12,
    color: '#4a5565',
    lineHeight: 20,
  },
  nutrition: {
    fontSize: 12,
    color: '#4a5565',
    lineHeight: 20,
  },
  calories: {
    fontWeight: '600',
    color: '#101828',
  },
});
