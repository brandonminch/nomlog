import React from 'react';
import {
  // Fruits & Vegetables
  Apple, Banana, Carrot, Cherry, Citrus, Grape, LeafyGreen,
  // Meat & Protein
  Beef, Drumstick, Egg, EggFried, Fish, FishSymbol, Ham, Nut,
  // Baked Goods & Desserts
  Cake, CakeSlice, Candy, CandyCane, Cookie, Croissant, Donut, Dessert, IceCreamBowl, IceCreamCone, Lollipop,
  // Beverages
  Beer, BeerOff, BottleWine, Coffee, CupSoda, GlassWater, Martini, Milk, MilkOff, Wine, WineOff,
  // Cooking & Food Preparation
  ChefHat, CookingPot, HandPlatter, Microwave, Utensils, UtensilsCrossed,
  // Prepared Foods & Meals
  Hamburger, Pizza, Salad, Sandwich, Soup, Wheat,
  // Containers & Storage
  Amphora, Barrel,
  // Other Food Items
  Bean, Popcorn,
  // "Off" Variants
  BeanOff, CandyOff, EggOff, FishOff, HopOff, NutOff,
  // Additional
  Hop,
} from 'lucide-react-native';

// Icon mapping: kebab-case icon name -> Lucide component
const iconMap: Record<string, React.ComponentType<any>> = {
  // Fruits & Vegetables
  'apple': Apple,
  'banana': Banana,
  'carrot': Carrot,
  'cherry': Cherry,
  'citrus': Citrus,
  'grape': Grape,
  'leafy-green': LeafyGreen,

  // Meat & Protein
  'beef': Beef,
  'drumstick': Drumstick,
  'egg': Egg,
  'egg-fried': EggFried,
  'fish': Fish,
  'fish-symbol': FishSymbol,
  'ham': Ham,
  'nut': Nut,

  // Baked Goods & Desserts
  'cake': Cake,
  'cake-slice': CakeSlice,
  'candy': Candy,
  'candy-cane': CandyCane,
  'cookie': Cookie,
  'croissant': Croissant,
  'donut': Donut,
  'dessert': Dessert,
  'ice-cream-bowl': IceCreamBowl,
  'ice-cream-cone': IceCreamCone,
  'lollipop': Lollipop,

  // Beverages
  'beer': Beer,
  'beer-off': BeerOff,
  'bottle-wine': BottleWine,
  'coffee': Coffee,
  'cup-soda': CupSoda,
  'glass-water': GlassWater,
  'martini': Martini,
  'milk': Milk,
  'milk-off': MilkOff,
  'wine': Wine,
  'wine-off': WineOff,

  // Cooking & Food Preparation
  'chef-hat': ChefHat,
  'cooking-pot': CookingPot,
  'hand-platter': HandPlatter,
  'microwave': Microwave,
  'utensils': Utensils,
  'utensils-crossed': UtensilsCrossed,

  // Prepared Foods & Meals
  'hamburger': Hamburger,
  'pizza': Pizza,
  'salad': Salad,
  'sandwich': Sandwich,
  'soup': Soup,
  'wheat': Wheat,

  // Containers & Storage
  'amphora': Amphora,
  'barrel': Barrel,

  // Other Food Items
  'bean': Bean,
  'popcorn': Popcorn,

  // "Off" Variants
  'bean-off': BeanOff,
  'candy-off': CandyOff,
  'egg-off': EggOff,
  'fish-off': FishOff,
  'hop-off': HopOff,
  'nut-off': NutOff,

  // Additional
  'hop': Hop,
};

/**
 * Get the Lucide icon component for a given icon name.
 * @param iconName - Icon name in kebab-case (e.g., "pizza", "coffee")
 * @returns The icon component, or Utensils as default
 */
export const getMealIcon = (iconName?: string): React.ComponentType<any> => {
  if (!iconName) {
    return Utensils;
  }

  const normalizedName = iconName.toLowerCase().trim();
  return iconMap[normalizedName] || Utensils;
};

