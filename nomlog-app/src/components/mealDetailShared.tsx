import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Clock, Dumbbell, Wheat, Droplet } from 'lucide-react-native';
import { MealLog, Nutrition } from '../types/mealLog';

export const hasValue = (value: number | undefined | null): boolean => {
  return value !== null && value !== undefined;
};

export const formatGrams = (value: number | undefined | null): string => {
  if (!hasValue(value)) return '';
  return `${Math.round(value!)}g`;
};

export const formatMilligrams = (value: number | undefined | null, decimals: number = 0): string => {
  if (!hasValue(value)) return '';
  if (decimals === 1) {
    return `${parseFloat(value!.toFixed(1))}mg`;
  }
  return `${Math.round(value!)}mg`;
};

export const formatMicrograms = (value: number | undefined | null, decimals: number = 0): string => {
  if (!hasValue(value)) return '';
  if (decimals === 1) {
    return `${parseFloat(value!.toFixed(1))}mcg`;
  }
  return `${Math.round(value!)}mcg`;
};

const MIN_INGREDIENT_SERVING = 1e-6;

const formatIngredientAmount = (amount: number): string => {
  if (!Number.isFinite(amount)) return '—';
  return parseFloat(amount.toFixed(2)).toString();
};

export const useInferredMealType = (mealLog: MealLog | null) => {
  return useMemo(() => {
    if (!mealLog) return 'snack';
    const mt = (mealLog as { meal_type?: string }).meal_type;
    if (mt) return mt;
    const dateToUse = mealLog.logged_at || mealLog.created_at;
    const hour = new Date(dateToUse).getHours();
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 21) return 'dinner';
    return 'snack';
  }, [mealLog]);
};

export const getBadgeColor = (mealType: string) => {
  switch (mealType?.toLowerCase()) {
    case 'breakfast':
      return '#ffedd4';
    case 'lunch':
      return '#dbeafe';
    case 'dinner':
      return '#e0e7ff';
    case 'snack':
      return '#dcfce7';
    default:
      return '#f3f4f6';
  }
};

export const getBadgeTextColor = (mealType: string) => {
  switch (mealType?.toLowerCase()) {
    case 'breakfast':
      return '#9f2d00';
    case 'lunch':
      return '#193cb8';
    case 'dinner':
      return '#3730a3';
    case 'snack':
      return '#016630';
    default:
      return '#6b7280';
  }
};

interface MealDetailTitleBlockProps {
  mealLog: MealLog;
  /** Favorite templates are not tied to a log time or meal-type slot; hide misleading badge and time. */
  variant?: 'log' | 'favoriteTemplate';
}

export const MealDetailTitleBlock: React.FC<MealDetailTitleBlockProps> = ({
  mealLog,
  variant = 'log',
}) => {
  const inferredMealType = useInferredMealType(mealLog);
  const isTemplate = variant === 'favoriteTemplate';

  return (
    <View style={sharedStyles.mealInfo}>
      <Text style={sharedStyles.mealName}>{mealLog.name || 'Meal'}</Text>
      {mealLog.description ? <Text style={sharedStyles.mealDescription}>{mealLog.description}</Text> : null}
      <View style={sharedStyles.timeBadgeRow}>
        <View style={sharedStyles.timeContainer}>
          <Clock size={12} color="#6a7282" />
          <Text style={sharedStyles.timeText}>
            {isTemplate
              ? '—'
              : new Date(mealLog.logged_at || mealLog.created_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
          </Text>
        </View>
        {isTemplate ? null : (
          <View style={[sharedStyles.badge, { backgroundColor: getBadgeColor(inferredMealType) }]}>
            <Text style={[sharedStyles.badgeText, { color: getBadgeTextColor(inferredMealType) }]}>
              {inferredMealType}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

interface MealDetailIngredientsSectionProps {
  mealLog: MealLog;
}

export const MealDetailIngredientsSection: React.FC<MealDetailIngredientsSectionProps> = ({ mealLog }) => {
  const rows = useMemo(() => {
    const list = mealLog.ingredients;
    if (!list?.length) return [];
    return list.filter((ing) => ing.servingAmount > MIN_INGREDIENT_SERVING);
  }, [mealLog.ingredients]);

  if (rows.length === 0) return null;

  return (
    <View style={sharedStyles.section}>
      <Text style={sharedStyles.sectionHeader}>INGREDIENTS</Text>
      <View style={sharedStyles.listCard}>
        {rows.map((ing, index) => (
          <View
            key={`${ing.name}-${index}`}
            style={[
              sharedStyles.listRow,
              sharedStyles.ingredientRow,
              index === rows.length - 1 && sharedStyles.listRowLast,
            ]}
          >
            <Text style={[sharedStyles.listLabel, sharedStyles.ingredientNameLine]} numberOfLines={4}>
              {ing.name}
            </Text>
            <Text style={sharedStyles.ingredientAmountLine}>
              {formatIngredientAmount(ing.servingAmount)} {ing.servingUnit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

interface MealDetailNutritionSectionsProps {
  mealLog: MealLog;
}

export const MealDetailNutritionSections: React.FC<MealDetailNutritionSectionsProps> = ({ mealLog }) => {
  const nutrition = mealLog.total_nutrition || ({} as Nutrition);
  const isAnalyzing = mealLog.analysis_status === 'pending' || mealLog.analysis_status === 'analyzing';

  return (
    <>
      {isAnalyzing && (
        <View style={sharedStyles.refiningBadge}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={sharedStyles.refiningText}>Crunching the nomz...</Text>
        </View>
      )}
      {hasValue(nutrition.calories) ||
      hasValue(nutrition.protein) ||
      hasValue(nutrition.carbohydrates) ||
      hasValue(nutrition.fat) ||
      hasValue(nutrition.saturatedFat) ? (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionHeader}>MACRONUTRIENTS</Text>
          <View style={sharedStyles.macronutrientsContainer}>
            {hasValue(nutrition.calories) && (
              <View style={sharedStyles.caloriesCard}>
                <Text style={sharedStyles.caloriesLabel}>Calories</Text>
                <Text style={sharedStyles.caloriesValue}>{Math.round(nutrition.calories!)}</Text>
              </View>
            )}
            <View style={sharedStyles.macroGrid}>
              {hasValue(nutrition.protein) && (
                <View style={sharedStyles.macroCard}>
                  <View style={sharedStyles.macroCardHeader}>
                    <View style={[sharedStyles.macroIcon, { backgroundColor: '#ffe2e2' }]}>
                      <Dumbbell size={12} color="#dc2626" />
                    </View>
                    <Text style={sharedStyles.macroLabel}>Protein</Text>
                  </View>
                  <Text style={sharedStyles.macroValue}>{formatGrams(nutrition.protein)}</Text>
                </View>
              )}
              {hasValue(nutrition.carbohydrates) && (
                <View style={sharedStyles.macroCard}>
                  <View style={sharedStyles.macroCardHeader}>
                    <View style={[sharedStyles.macroIcon, { backgroundColor: '#fef9c2' }]}>
                      <Wheat size={12} color="#ca8a04" />
                    </View>
                    <Text style={sharedStyles.macroLabel}>Carbs</Text>
                  </View>
                  <Text style={sharedStyles.macroValue}>{formatGrams(nutrition.carbohydrates)}</Text>
                </View>
              )}
              {hasValue(nutrition.fat) && (
                <View style={sharedStyles.macroCard}>
                  <View style={sharedStyles.macroCardHeader}>
                    <View style={[sharedStyles.macroIcon, { backgroundColor: '#e9d5ff' }]}>
                      <Droplet size={12} color="#9810fa" />
                    </View>
                    <Text style={sharedStyles.macroLabel}>Fat</Text>
                  </View>
                  <Text style={sharedStyles.macroValue}>{formatGrams(nutrition.fat)}</Text>
                </View>
              )}
              {hasValue(nutrition.saturatedFat) && (
                <View style={sharedStyles.macroCard}>
                  <View style={sharedStyles.macroCardHeader}>
                    <View style={[sharedStyles.macroIcon, { backgroundColor: '#f3e8ff' }]}>
                      <Droplet size={12} color="#7c3aed" />
                    </View>
                    <Text style={sharedStyles.macroLabel}>Sat Fat</Text>
                  </View>
                  <Text style={sharedStyles.macroValue}>{formatGrams(nutrition.saturatedFat)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {(hasValue(nutrition.fiber) || hasValue(nutrition.sugar)) && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionHeader}>CARBOHYDRATE DETAILS</Text>
          <View style={sharedStyles.listCard}>
            {hasValue(nutrition.fiber) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Fiber</Text>
                <Text style={sharedStyles.listValue}>{formatGrams(nutrition.fiber)}</Text>
              </View>
            )}
            {hasValue(nutrition.sugar) && (
              <View style={[sharedStyles.listRow, !hasValue(nutrition.fiber) && sharedStyles.listRowLast]}>
                <Text style={sharedStyles.listLabel}>Sugar</Text>
                <Text style={sharedStyles.listValue}>{formatGrams(nutrition.sugar)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {(hasValue(nutrition.sodium) ||
        hasValue(nutrition.potassium) ||
        hasValue(nutrition.calcium) ||
        hasValue(nutrition.iron) ||
        hasValue(nutrition.magnesium)) && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionHeader}>MINERALS</Text>
          <View style={sharedStyles.listCard}>
            {hasValue(nutrition.sodium) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Sodium</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.sodium)}</Text>
              </View>
            )}
            {hasValue(nutrition.potassium) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Potassium</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.potassium)}</Text>
              </View>
            )}
            {hasValue(nutrition.calcium) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Calcium</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.calcium)}</Text>
              </View>
            )}
            {hasValue(nutrition.iron) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Iron</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.iron, 1)}</Text>
              </View>
            )}
            {hasValue(nutrition.magnesium) && (
              <View style={[sharedStyles.listRow, sharedStyles.listRowLast]}>
                <Text style={sharedStyles.listLabel}>Magnesium</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.magnesium)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {(hasValue(nutrition.vitaminA) || hasValue(nutrition.vitaminC) || hasValue(nutrition.vitaminD)) && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionHeader}>VITAMINS</Text>
          <View style={sharedStyles.listCard}>
            {hasValue(nutrition.vitaminA) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Vitamin A</Text>
                <Text style={sharedStyles.listValue}>{formatMicrograms(nutrition.vitaminA)}</Text>
              </View>
            )}
            {hasValue(nutrition.vitaminC) && (
              <View style={sharedStyles.listRow}>
                <Text style={sharedStyles.listLabel}>Vitamin C</Text>
                <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.vitaminC)}</Text>
              </View>
            )}
            {hasValue(nutrition.vitaminD) && (
              <View style={[sharedStyles.listRow, sharedStyles.listRowLast]}>
                <Text style={sharedStyles.listLabel}>Vitamin D</Text>
                <Text style={sharedStyles.listValue}>{formatMicrograms(nutrition.vitaminD, 1)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {hasValue(nutrition.cholesterol) && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionHeader}>OTHER</Text>
          <View style={sharedStyles.listCard}>
            <View style={[sharedStyles.listRow, sharedStyles.listRowLast]}>
              <Text style={sharedStyles.listLabel}>Cholesterol</Text>
              <Text style={sharedStyles.listValue}>{formatMilligrams(nutrition.cholesterol)}</Text>
            </View>
          </View>
        </View>
      )}
    </>
  );
};

export const sharedStyles = StyleSheet.create({
  mealInfo: {
    width: '100%',
  },
  mealName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 24,
    letterSpacing: -0.3125,
    marginBottom: 4,
  },
  mealDescription: {
    fontSize: 14,
    color: '#4a5565',
    lineHeight: 20,
    letterSpacing: -0.1504,
    marginBottom: 10,
  },
  timeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#6a7282',
    lineHeight: 16,
  },
  badge: {
    paddingHorizontal: 8.692,
    paddingVertical: 4.692,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  section: {
    paddingTop: 16,
    paddingBottom: 0.698,
    borderBottomWidth: 0.698,
    borderBottomColor: '#f3f4f6',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a7282',
    letterSpacing: 0.6,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  macronutrientsContainer: {
    gap: 12,
  },
  caloriesCard: {
    backgroundColor: '#fff',
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 12.691,
    paddingVertical: 12.691,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caloriesLabel: {
    fontSize: 14,
    color: '#4a5565',
    lineHeight: 20,
    letterSpacing: -0.1504,
  },
  caloriesValue: {
    fontSize: 24,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 32,
    letterSpacing: 0.0703,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  macroCard: {
    backgroundColor: '#fff',
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 12.691,
    paddingVertical: 12.691,
    width: '47%',
    gap: 8,
  },
  macroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 12,
    color: '#6a7282',
    lineHeight: 16,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 24,
    letterSpacing: -0.3125,
  },
  listCard: {
    backgroundColor: '#fff',
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.698,
    borderBottomColor: '#f3f4f6',
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  ingredientRow: {
    alignItems: 'flex-start',
  },
  listLabel: {
    fontSize: 14,
    color: '#101828',
    lineHeight: 20,
    letterSpacing: -0.1504,
  },
  listValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 20,
    letterSpacing: -0.1504,
  },
  ingredientNameLine: {
    flex: 1,
    marginRight: 12,
    fontWeight: '400',
  },
  ingredientAmountLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
    lineHeight: 20,
    letterSpacing: -0.1504,
    flexShrink: 0,
    textAlign: 'right',
  },
  refiningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  refiningText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
  },
});
