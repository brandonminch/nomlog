import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Clock, Dumbbell, Wheat, Zap, Droplet, Star, BookOpen } from 'lucide-react-native';
import { MealLog } from '../types/mealLog';
import { getMealIcon } from '../utils/mealIcons';
import { MealLogOverflowMenu } from './MealLogOverflowMenu';

interface MealLogCardProps {
  mealLog: MealLog;
  isFavorited?: boolean;
  /** Favorite templates have no log time; show an em dash instead of a synthetic timestamp. */
  hideLogTime?: boolean;
  onDelete?: (mealLogId: string) => void;
  onEditMealInChat?: (mealLog: MealLog) => void;
  /** Opens inline edit screen (real meal logs only). */
  onEditMealInline?: (mealLog: MealLog) => void;
  onDetailPress?: (mealLog: MealLog) => void;
  onFavorite?: (mealLogId: string) => void;
  onUnfavorite?: (mealLogId: string) => void;
  onLogPlanned?: (mealLog: MealLog) => void;
  onViewRecipe?: (mealLog: MealLog) => void;
}

export const MealLogCard = ({
  mealLog,
  isFavorited = false,
  hideLogTime = false,
  onDelete,
  onEditMealInChat,
  onEditMealInline,
  onDetailPress,
  onFavorite,
  onUnfavorite,
  onLogPlanned,
  onViewRecipe,
}: MealLogCardProps) => {
  const { name, description, total_nutrition, created_at, id, analysis_status, icon } = mealLog;
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; isSwipe: boolean } | null>(null);
  const isPlanned = mealLog.status === 'planned';
  
  // Check if analysis is in progress
  const isAnalyzing = analysis_status === 'pending' || analysis_status === 'analyzing';
  
  const dateToUse = isPlanned
    ? (mealLog.planned_for || created_at)
    : (mealLog.logged_at || created_at);
  const time = useMemo(
    () =>
      new Date(dateToUse).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    [dateToUse]
  );

  // Get the icon component for this meal
  const IconComponent = getMealIcon(icon);
  const iconColor = '#101828';

  const handleCardPress = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    
    // Check if this was a swipe (significant horizontal movement)
    if (touchStartRef.current && touchStartRef.current.isSwipe) {
      touchStartRef.current = null;
      return; // Don't open detail if it was a swipe
    }
    
    touchStartRef.current = null;
    if (onDetailPress) {
      onDetailPress(mealLog);
    }
  };

  const handleLogPlanned = () => {
    if (!isPlanned) return;
    if (onLogPlanned) onLogPlanned(mealLog);
  };

  const handleViewRecipe = () => {
    if (!isPlanned || !mealLog.recipe_id) return;
    if (onViewRecipe) onViewRecipe(mealLog);
  };

  const handleTouchStart = (event: any) => {
    // Store initial touch position
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      isSwipe: false,
    };
  };

  const handleTouchMove = (event: any) => {
    if (!touchStartRef.current) return;
    
    // Calculate movement distance
    const deltaX = Math.abs(event.nativeEvent.pageX - touchStartRef.current.x);
    const deltaY = Math.abs(event.nativeEvent.pageY - touchStartRef.current.y);
    
    // If horizontal movement is significant (more than 10 pixels) and greater than vertical movement, treat it as a swipe
    if (deltaX > 10 && deltaX > deltaY) {
      touchStartRef.current.isSwipe = true;
    }
  };

  return (
    <View
      style={[styles.container, isPlanned ? styles.plannedContainer : null]}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
    {isPlanned ? (
      <LinearGradient
        colors={['rgba(250, 245, 255, 0.5)', 'rgba(239, 246, 255, 0.5)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.plannedGradient}
      >
        <TouchableOpacity 
          style={styles.touchableContent}
          onPress={handleCardPress}
          activeOpacity={0.7}
        >
          {/* Main Card Content */}
          <View style={styles.cardContent}>
        {/* Meal Header */}
        <View style={styles.mealHeader}>
          <View style={styles.mealInfo}>
            <View style={styles.mealIconContainer}>
              <IconComponent size={20} color={iconColor} />
            </View>
            <Text style={styles.mealName}>{name || 'Avocado Toast'}</Text>
          </View>
          
          {/* Menu Button */}
          <MealLogOverflowMenu
            mealLogId={id}
            isFavorited={isFavorited}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onEditInChat={onEditMealInChat ? () => onEditMealInChat(mealLog) : undefined}
            onEditInline={onEditMealInline ? () => onEditMealInline(mealLog) : undefined}
            editDisabled={isAnalyzing}
            onFavorite={onFavorite}
            onUnfavorite={onUnfavorite}
            onDelete={onDelete}
          />
        </View>
        
        {/* Description */}
        <Text style={styles.description}>
          {description || ''}
        </Text>
        
        {/* Time, Badge, and Calories Row */}
        <View style={styles.timeBadgeCaloriesRow}>
          <View style={styles.timeBadgeContainer}>
            {isPlanned ? (
              <View style={styles.plannedPill}>
                <Clock size={12} color="#ffffff" />
                <Text style={styles.plannedPillText}>{`PLANNED - ${time}`}</Text>
              </View>
            ) : (
              <View style={styles.timeContainer}>
                <Clock size={12} color="#6a7282" />
                <Text style={styles.timeText}>{hideLogTime ? '—' : time}</Text>
              </View>
            )}
            {isFavorited && (
              <View style={styles.favoriteBadge}>
                <Star size={12} color="#9810fa" strokeWidth={2} fill="#9810fa" />
                <Text style={styles.favoriteBadgeText}>Favorite</Text>
              </View>
            )}
          </View>
          <View style={styles.caloriesContainer}>
            <Zap size={12} color="#99a1af" />
            <Text style={styles.caloriesText}>
              {!isAnalyzing && typeof total_nutrition?.calories === 'number' ? `${Math.round(total_nutrition.calories)} calories` : '—'}
            </Text>
          </View>
        </View>

        {/* Nutrition Cards */}
        <View style={styles.nutritionContainer}>
          <View style={styles.nutritionItem}>
            <View style={[styles.nutritionIcon, { backgroundColor: '#ffe2e2' }]}>
              <Dumbbell size={12} color="#dc2626" />
            </View>
            <View style={styles.nutritionText}>
              <Text style={styles.nutritionLabel}>Protein</Text>
              <Text style={styles.nutritionValue}>
                {!isAnalyzing && typeof total_nutrition?.protein === 'number' ? `${Math.round(total_nutrition.protein)}g` : '—'}
              </Text>
            </View>
          </View>
          
          <View style={styles.nutritionItem}>
            <View style={[styles.nutritionIcon, { backgroundColor: '#fef9c2' }]}>
              <Wheat size={12} color="#ca8a04" />
            </View>
            <View style={styles.nutritionText}>
              <Text style={styles.nutritionLabel}>Carbs</Text>
              <Text style={styles.nutritionValue}>
                {!isAnalyzing && typeof total_nutrition?.carbohydrates === 'number' ? `${Math.round(total_nutrition.carbohydrates)}g` : '—'}
              </Text>
            </View>
          </View>
          
          <View style={styles.nutritionItem}>
            <View style={[styles.nutritionIcon, { backgroundColor: '#e9d5ff' }]}>
              <Droplet size={12} color="#9810fa" />
            </View>
            <View style={styles.nutritionText}>
              <Text style={styles.nutritionLabel}>Fat</Text>
              <Text style={styles.nutritionValue}>
                {!isAnalyzing && typeof total_nutrition?.fat === 'number' ? `${Math.round(total_nutrition.fat)}g` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {isPlanned && (
          <>
            {mealLog.recipe_id ? (
              <TouchableOpacity
                style={styles.viewRecipeButton}
                onPress={handleViewRecipe}
                activeOpacity={0.85}
                disabled={!onViewRecipe}
              >
                <BookOpen size={16} color="#7c3aed" strokeWidth={2} />
                <Text style={styles.viewRecipeButtonText}>View recipe</Text>
              </TouchableOpacity>
            ) : null}

          <TouchableOpacity
            style={styles.logPlannedButtonWrapper}
            onPress={handleLogPlanned}
            activeOpacity={0.85}
            disabled={!onLogPlanned}
          >
            <LinearGradient
              colors={['#9810fa', '#155dfc']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logPlannedButton}
            >
              <Check size={16} color="#ffffff" strokeWidth={2} />
              <Text style={styles.logPlannedButtonText}>Log this Meal</Text>
            </LinearGradient>
          </TouchableOpacity>
          </>
        )}

        {isAnalyzing && (
          <View style={styles.analyzingFooter}>
            <ActivityIndicator size="small" color="#6a7282" style={styles.analyzingSpinner} />
            <Text style={styles.analyzingFooterText}>Crunching the nomz...</Text>
          </View>
        )}
          </View>
        </TouchableOpacity>
      </LinearGradient>
    ) : (
      <TouchableOpacity 
        style={styles.touchableContent}
        onPress={handleCardPress}
        activeOpacity={0.7}
      >
        {/* Main Card Content */}
        <View style={styles.cardContent}>
          {/* Meal Header */}
          <View style={styles.mealHeader}>
            <View style={styles.mealInfo}>
              <View style={styles.mealIconContainer}>
                <IconComponent size={20} color={iconColor} />
              </View>
              <Text style={styles.mealName}>{name || 'Avocado Toast'}</Text>
            </View>
            
            {/* Menu Button */}
            <MealLogOverflowMenu
              mealLogId={id}
              isFavorited={isFavorited}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onEditInChat={onEditMealInChat ? () => onEditMealInChat(mealLog) : undefined}
              onEditInline={onEditMealInline ? () => onEditMealInline(mealLog) : undefined}
              editDisabled={isAnalyzing}
              onFavorite={onFavorite}
              onUnfavorite={onUnfavorite}
              onDelete={onDelete}
            />
          </View>
          
          {/* Description */}
          <Text style={styles.description}>
            {description || ''}
          </Text>
          
          {/* Time, Badge, and Calories Row */}
          <View style={styles.timeBadgeCaloriesRow}>
            <View style={styles.timeBadgeContainer}>
              {isPlanned ? (
                <View style={styles.plannedPill}>
                  <Clock size={12} color="#ffffff" />
                  <Text style={styles.plannedPillText}>{`PLANNED - ${time}`}</Text>
                </View>
              ) : (
                <View style={styles.timeContainer}>
                  <Clock size={12} color="#6a7282" />
                  <Text style={styles.timeText}>{hideLogTime ? '—' : time}</Text>
                </View>
              )}
              {isFavorited && (
                <View style={styles.favoriteBadge}>
                  <Star size={12} color="#9810fa" strokeWidth={2} fill="#9810fa" />
                  <Text style={styles.favoriteBadgeText}>Favorite</Text>
                </View>
              )}
            </View>
            <View style={styles.caloriesContainer}>
              <Zap size={12} color="#99a1af" />
              <Text style={styles.caloriesText}>
                {!isAnalyzing && typeof total_nutrition?.calories === 'number' ? `${Math.round(total_nutrition.calories)} calories` : '—'}
              </Text>
            </View>
          </View>

          {/* Nutrition Cards */}
          <View style={styles.nutritionContainer}>
            <View style={styles.nutritionItem}>
              <View style={[styles.nutritionIcon, { backgroundColor: '#ffe2e2' }]}>
                <Dumbbell size={12} color="#dc2626" />
              </View>
              <View style={styles.nutritionText}>
                <Text style={styles.nutritionLabel}>Protein</Text>
                <Text style={styles.nutritionValue}>
                  {!isAnalyzing && typeof total_nutrition?.protein === 'number' ? `${Math.round(total_nutrition.protein)}g` : '—'}
                </Text>
              </View>
            </View>
            
            <View style={styles.nutritionItem}>
              <View style={[styles.nutritionIcon, { backgroundColor: '#fef9c2' }]}>
                <Wheat size={12} color="#ca8a04" />
              </View>
              <View style={styles.nutritionText}>
                <Text style={styles.nutritionLabel}>Carbs</Text>
                <Text style={styles.nutritionValue}>
                  {!isAnalyzing && typeof total_nutrition?.carbohydrates === 'number' ? `${Math.round(total_nutrition.carbohydrates)}g` : '—'}
                </Text>
              </View>
            </View>
            
            <View style={styles.nutritionItem}>
              <View style={[styles.nutritionIcon, { backgroundColor: '#e9d5ff' }]}>
                <Droplet size={12} color="#9810fa" />
              </View>
              <View style={styles.nutritionText}>
                <Text style={styles.nutritionLabel}>Fat</Text>
                <Text style={styles.nutritionValue}>
                  {!isAnalyzing && typeof total_nutrition?.fat === 'number' ? `${Math.round(total_nutrition.fat)}g` : '—'}
                </Text>
              </View>
            </View>
          </View>

          {isPlanned && (
            <TouchableOpacity
              style={styles.logPlannedButtonWrapper}
              onPress={handleLogPlanned}
              activeOpacity={0.85}
              disabled={!onLogPlanned}
            >
              <LinearGradient
                colors={['#9810fa', '#155dfc']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.logPlannedButton}
              >
                <Check size={16} color="#ffffff" strokeWidth={2} />
                <Text style={styles.logPlannedButtonText}>Log this Meal</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {isAnalyzing && (
            <View style={styles.analyzingFooter}>
              <ActivityIndicator size="small" color="#6a7282" style={styles.analyzingSpinner} />
              <Text style={styles.analyzingFooterText}>Crunching the nomz...</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  plannedContainer: {
    backgroundColor: 'transparent',
    borderColor: '#dab2ff',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  plannedGradient: {
    borderRadius: 16,
  },
  touchableContent: {
    flex: 1,
  },
  
  cardContent: {
    padding: 16.688,
    gap: 8,
  },
  
  // Meal Header
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  mealInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  mealIconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#101828',
    lineHeight: 24,
    letterSpacing: -0.3125,
    flex: 1,
    flexWrap: 'wrap',
  },
  description: {
    fontSize: 14,
    color: '#4a5565',
    lineHeight: 20,
    letterSpacing: -0.1504,
  },
  analyzingFooter: {
    marginTop: 2,
    paddingTop: 2,
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
  
  // Time, Badge, and Calories Row
  timeBadgeCaloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  timeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plannedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9810fa',
    borderRadius: 9999,
    paddingHorizontal: 10,
    height: 23,
  },
  plannedPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.12,
  },
  timeText: {
    fontSize: 12,
    color: '#6a7282',
    lineHeight: 16,
  },
  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8.692,
    paddingVertical: 4.692,
    borderRadius: 8,
    backgroundColor: '#f3e8ff',
  },
  favoriteBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: '#9810fa',
  },
  caloriesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  caloriesText: {
    fontSize: 14,
    color: '#99a1af',
    lineHeight: 16,
  },
  
  // Nutrition Container
  nutritionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 24
  },
  nutritionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 8.69,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  nutritionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nutritionText: {
    flex: 1,
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#6a7282',
    lineHeight: 16,
    marginBottom: 0,
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#101828',
    lineHeight: 24,
    letterSpacing: -0.3125,
  },
  viewRecipeButton: {
    marginTop: 16,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    backgroundColor: '#faf5ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  viewRecipeButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#7c3aed',
    letterSpacing: -0.2,
  },
  logPlannedButtonWrapper: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  logPlannedButton: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logPlannedButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: -0.3125,
  },
  refiningContainer: {
    marginTop: 24,
    alignItems: 'flex-start',
  },
  refiningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
  },
  refiningText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
  },
}); 