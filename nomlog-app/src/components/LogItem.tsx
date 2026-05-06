import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Nutrition = {
  fat: number;
  protein: number;
  calories: number;
  carbohydrates: number;
};

type Ingredient = {
  name: string;
  nutrition: Nutrition;
  servingAmount: number;
  servingUnit: string;
  servingSizeGrams: number;
};

type Log = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  total_nutrition: Nutrition;
  ingredients: Ingredient[];
  created_at: string;
  updated_at: string;
};

type LogItemProps = {
  log: Log;
};

export const LogItem = ({ log }: LogItemProps) => {
  const date = new Date(log.created_at);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{log.name}</Text>
      <Text style={styles.description}>{log.description}</Text>
      
      <View style={styles.nutritionContainer}>
        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionValue}>{log.total_nutrition.calories}</Text>
          <Text style={styles.nutritionLabel}>calories</Text>
        </View>
        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionValue}>{Math.round(log.total_nutrition.protein)}g</Text>
          <Text style={styles.nutritionLabel}>protein</Text>
        </View>
        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionValue}>{Math.round(log.total_nutrition.carbohydrates)}g</Text>
          <Text style={styles.nutritionLabel}>carbs</Text>
        </View>
        <View style={styles.nutritionItem}>
          <Text style={styles.nutritionValue}>{Math.round(log.total_nutrition.fat)}g</Text>
          <Text style={styles.nutritionLabel}>fat</Text>
        </View>
      </View>

      <View style={styles.ingredientsContainer}>
        <Text style={styles.ingredientsTitle}>Ingredients:</Text>
        {log.ingredients.map((ingredient, index) => (
          <Text key={index} style={styles.ingredient}>
            • {ingredient.name} ({ingredient.servingAmount} {ingredient.servingUnit})
          </Text>
        ))}
      </View>

      <Text style={styles.timestamp}>{formattedDate}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  nutritionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  ingredientsContainer: {
    marginBottom: 12,
  },
  ingredientsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  ingredient: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
}); 