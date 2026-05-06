import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Coffee, UtensilsCrossed, Apple, Sun, Moon, Dumbbell, Wheat, Droplet } from 'lucide-react-native';
import { getMealIcon } from '../utils/mealIcons';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type MealItem = {
  title: string;
  icon?: string;
};

type MealGroupCardProps = {
  mealType: MealType;
  count: number;
  items: MealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbohydrates: number;
  totalFat: number;
  plannedCalories?: number;
  plannedProtein?: number;
  plannedCarbohydrates?: number;
  plannedFat?: number;
  plannedItems?: MealItem[];
  plannedCount?: number;
  hasPlannedMeals?: boolean;
  summaryText?: string | null;
  onPress?: () => void;
  onEmptyPress?: () => void;
  isAnalyzing?: boolean;
};

const getMealLabel = (mealType: MealType) => {
  switch (mealType) {
    case 'breakfast':
      return 'Breakfast';
    case 'lunch':
      return 'Lunch';
    case 'dinner':
      return 'Dinner';
    case 'snack':
      return 'Snacks';
    default:
      return 'Meal';
  }
};

const getMealIconConfig = (mealType: MealType) => {
  switch (mealType) {
    case 'breakfast':
      return { Icon: Coffee, color: '#FF6B35', background: '#FFF4E6' };
    case 'lunch':
      return { Icon: Sun, color: '#F59E0B', background: '#FEF3C7' };
    case 'dinner':
      return { Icon: Moon, color: '#4F46E5', background: '#E0E7FF' };
    case 'snack':
      return { Icon: Apple, color: '#16A34A', background: '#DCFCE7' };
    default:
      return { Icon: UtensilsCrossed, color: '#6B7280', background: '#E5E7EB' };
  }
};

export const MealGroupCard: React.FC<MealGroupCardProps> = ({
  mealType,
  count,
  items,
  totalCalories,
  totalProtein,
  totalCarbohydrates,
  totalFat,
  plannedCalories = 0,
  plannedProtein = 0,
  plannedCarbohydrates = 0,
  plannedFat = 0,
  plannedItems = [],
  plannedCount = 0,
  hasPlannedMeals = false,
  summaryText,
  onPress,
  onEmptyPress,
  isAnalyzing,
}) => {
  const hasMeals = count > 0 || hasPlannedMeals;
  const label = getMealLabel(mealType);
  const { Icon, color, background } = getMealIconConfig(mealType);

  const cardPaddingBottom = hasPlannedMeals
    ? isAnalyzing
      ? 10
      : 0
    : isAnalyzing
      ? 10
      : 16;

  if (!hasMeals) {
    return (
      <View style={styles.emptyRowContainer}>
        <View style={styles.emptyRowLeft}>
          <View style={[styles.iconCircle, { backgroundColor: background }]}>
            <Icon size={20} color={color} strokeWidth={2} />
          </View>
          <View style={styles.emptyRowTextContainer}>
            <Text style={styles.emptyRowTitle}>{label}</Text>
            <Text style={styles.emptyRowSubtitle}>No meals logged</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onEmptyPress}
          activeOpacity={0.8}
          style={styles.emptyRowPlusButton}
        >
          <Ionicons name="add" size={20} color="#111827" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cardShadowShell}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.cardInner, { paddingBottom: cardPaddingBottom }]}
      >
      <View style={styles.cardTopRow}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.iconCircle, { backgroundColor: background }]}>
            <Icon size={22} color={color} strokeWidth={2} />
          </View>
          <View style={styles.titleContainer}>
            <View style={styles.titleRowWrapper}>
              <View style={styles.titleRow}>
                <Text style={styles.mealTitle}>{label}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {count} {count === 1 ? 'item logged' : 'items logged'}
                  </Text>
                </View>
              </View>
            </View>
            {items.length > 0 && (
              <View style={styles.mealTitlesContainer}>
                {items.map((item, index) => {
                  const ItemIcon = getMealIcon(item.icon);
                  return (
                    <View key={`${item.title}-${index}`} style={styles.mealTitleRow}>
                      <View style={styles.mealTitleIconWrapper}>
                        <ItemIcon size={14} color="#6B7280" strokeWidth={2} />
                      </View>
                      <Text
                        style={styles.mealTitleItem}
                      >
                        {item.title}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
        <View style={styles.caloriesContainer}>
          <Text style={styles.caloriesValue}>{Math.round(totalCalories)}</Text>
          <Text style={styles.caloriesLabel}>calories</Text>
        </View>
      </View>

      {count > 0 && (
        <View style={styles.macrosRow}>
          <View style={styles.macroTile}>
            <View style={styles.macroIconCircleProtein}>
              <Dumbbell size={14} color="#DC2626" strokeWidth={2} />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroLabel}>Protein</Text>
              <Text style={styles.macroValue}>{Math.round(totalProtein)}g</Text>
            </View>
          </View>
          <View style={styles.macroTile}>
            <View style={styles.macroIconCircleCarbs}>
              <Wheat size={14} color="#CA8A04" strokeWidth={2} />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroLabel}>Carbs</Text>
              <Text style={styles.macroValue}>{Math.round(totalCarbohydrates)}g</Text>
            </View>
          </View>
          <View style={styles.macroTile}>
            <View style={styles.macroIconCircleFat}>
              <Droplet size={14} color="#7C3AED" strokeWidth={2} />
            </View>
            <View style={styles.macroTextContainer}>
              <Text style={styles.macroLabel}>Fat</Text>
              <Text style={styles.macroValue}>{Math.round(totalFat)}g</Text>
            </View>
          </View>
        </View>
      )}

      {hasPlannedMeals && (
        <View style={styles.plannedSection}>
          <View style={styles.plannedSectionHeader}>
            <View style={styles.plannedPill}>
              <Text style={styles.plannedPillLabel}>
                {plannedCount} {plannedCount === 1 ? 'Item' : 'Items'} Planned
              </Text>
            </View>
            <Text style={styles.plannedCaloriesText}>
              {Math.round(plannedCalories)} calories
            </Text>
          </View>
          {plannedItems.length > 0 && (
            <View style={styles.plannedMealTitlesContainer}>
              {plannedItems.map((item, index) => {
                const ItemIcon = getMealIcon(item.icon);
                return (
                  <View key={`planned-${item.title}-${index}`} style={styles.mealTitleRow}>
                    <View style={styles.mealTitleIconWrapper}>
                      <ItemIcon size={14} color="#6B7280" strokeWidth={2} />
                    </View>
                    <Text style={styles.mealTitleItem}>{item.title}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.plannedMacrosRow}>
            <View style={styles.plannedMacroColumn}>
              <View style={styles.plannedMacroIconCircle}>
                <Dumbbell size={10} color="#4b5563" strokeWidth={2} />
              </View>
              <View style={styles.plannedMacroTextBlock}>
                <Text style={styles.plannedMacroLabel}>Protein</Text>
                <Text style={styles.plannedMacroValue}>{Math.round(plannedProtein)}g</Text>
              </View>
            </View>
            <View style={styles.plannedMacroColumn}>
              <View style={styles.plannedMacroIconCircle}>
                <Wheat size={10} color="#4b5563" strokeWidth={2} />
              </View>
              <View style={styles.plannedMacroTextBlock}>
                <Text style={styles.plannedMacroLabel}>Carbs</Text>
                <Text style={styles.plannedMacroValue}>{Math.round(plannedCarbohydrates)}g</Text>
              </View>
            </View>
            <View style={styles.plannedMacroColumn}>
              <View style={styles.plannedMacroIconCircle}>
                <Droplet size={10} color="#4b5563" strokeWidth={2} />
              </View>
              <View style={styles.plannedMacroTextBlock}>
                <Text style={styles.plannedMacroLabel}>Fat</Text>
                <Text style={styles.plannedMacroValue}>{Math.round(plannedFat)}g</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {isAnalyzing && (
        <View style={styles.analyzingFooter}>
          <ActivityIndicator size="small" color="#6a7282" style={styles.analyzingSpinner} />
          <Text style={styles.analyzingFooterText}>Crunching the nomz...</Text>
        </View>
      )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Shadow + border live here so iOS still paints the drop shadow (overflow:hidden on the inner clips content only). */
  cardShadowShell: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardInner: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  titleRowWrapper: {
    height: 40,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  mealSummary: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
  },
  mealTitlesContainer: {
    marginTop: 8,
    paddingTop: 4,
    gap: 4,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mealTitleIconWrapper: {
    marginRight: 6,
    marginTop: 2,
    marginLeft: -18,
  },
  mealTitleItem: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
  },
  caloriesContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  caloriesValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  caloriesLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
  },
  macroTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  macroTextContainer: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  macroIconCircleProtein: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroIconCircleCarbs: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEF9C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroIconCircleFat: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroLabel: {
    fontSize: 12,
    color: '#6A7282',
  },
  macroValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
  },
  analyzingFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  analyzingSpinner: {
    transform: [{ scale: 0.75 }],
  },
  analyzingFooterText: {
    fontSize: 12,
    color: '#6a7282',
  },
  plannedSection: {
    marginTop: 16,
    marginHorizontal: -16,
    paddingTop: 13,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: 'rgba(249, 250, 251, 0.5)',
  },
  plannedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  /** Inset matches cardTopLeft: icon (40) + titleContainer margin (12) so rows align with logged meal list. */
  plannedMealTitlesContainer: {
    marginTop: 4,
    marginBottom: 10,
    paddingLeft: 52,
    gap: 4,
  },
  plannedPill: {
    backgroundColor: '#9810fa',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 23,
  },
  plannedPillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  plannedCaloriesText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a5565',
    letterSpacing: -0.15,
  },
  plannedMacrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  plannedMacroColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  plannedMacroIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannedMacroTextBlock: {
    justifyContent: 'center',
  },
  plannedMacroLabel: {
    fontSize: 12,
    color: '#6a7282',
    lineHeight: 16,
  },
  plannedMacroValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#364153',
    letterSpacing: -0.15,
  },
  emptyRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 10,
  },
  emptyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emptyRowTextContainer: {
    marginLeft: 12,
  },
  emptyRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptyRowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  emptyRowPlusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

