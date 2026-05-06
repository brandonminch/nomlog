/**
 * Generates appropriate picker values for serving amounts based on unit type
 */

/** Prepend 0 so users can remove an ingredient by setting amount to zero. */
function prependZeroUnlessPresent(values: number[]): number[] {
  if (values.length === 0) return [0];
  return values[0] === 0 ? values : [0, ...values];
}

export type UnitCategory = 'countable' | 'cups' | 'tablespoons' | 'teaspoons' | 'milliliters' | 'grams' | 'ounces' | 'unknown';

/**
 * Categorizes a unit string into a known category
 */
export function categorizeUnit(unit: string): UnitCategory {
  const normalized = unit.toLowerCase().trim();
  
  // Countable units
  const countableUnits = ['sausage', 'sausages', 'bun', 'buns', 'slice', 'slices', 'piece', 'pieces', 'patty', 'patties', 'item', 'items'];
  if (countableUnits.some(u => normalized.includes(u))) {
    return 'countable';
  }
  
  // Cups
  if (normalized.includes('cup') || normalized === 'c') {
    return 'cups';
  }
  
  // Tablespoons
  if (normalized.includes('tablespoon') || normalized === 'tbsp' || normalized === 'tbs') {
    return 'tablespoons';
  }
  
  // Teaspoons
  if (normalized.includes('teaspoon') || normalized === 'tsp') {
    return 'teaspoons';
  }
  
  // Milliliters
  if (normalized.includes('milliliter') || normalized === 'ml' || normalized === 'millilitre') {
    return 'milliliters';
  }
  
  // Liters (convert to ml for picker)
  if (normalized.includes('liter') || normalized === 'l' || normalized === 'litre') {
    return 'milliliters'; // Will be handled specially
  }
  
  // Grams
  if (normalized.includes('gram') || normalized === 'g') {
    return 'grams';
  }
  
  // Ounces
  if (normalized.includes('ounce') || normalized === 'oz') {
    return 'ounces';
  }
  
  return 'unknown';
}

/**
 * Generates picker values based on unit category
 */
export function generatePickerValues(unit: string, currentAmount: number): number[] {
  const category = categorizeUnit(unit);
  const normalized = unit.toLowerCase().trim();
  
  // Liters are handled in the milliliters case below
  
  switch (category) {
    case 'countable': {
      // 0.5 steps, range 0.25 to 20
      const values: number[] = [];
      for (let i = 0.25; i <= 5; i += 0.25) {
        values.push(parseFloat(i.toFixed(2)));
      }
      for (let i = 5.5; i <= 10; i += 0.5) {
        values.push(parseFloat(i.toFixed(1)));
      }
      values.push(12, 15, 20);
      return prependZeroUnlessPresent(values);
    }
    
    case 'cups': {
      // 0.25 steps up to 2, then 0.5 steps
      const values: number[] = [];
      for (let i = 0.25; i <= 2; i += 0.25) {
        values.push(parseFloat(i.toFixed(2)));
      }
      for (let i = 2.5; i <= 10; i += 0.5) {
        values.push(parseFloat(i.toFixed(1)));
      }
      return prependZeroUnlessPresent(values);
    }
    
    case 'tablespoons': {
      // 0.5 steps up to 3, then whole numbers
      const values: number[] = [];
      for (let i = 0.5; i <= 3; i += 0.5) {
        values.push(parseFloat(i.toFixed(1)));
      }
      for (let i = 4; i <= 20; i += 1) {
        values.push(i);
      }
      return prependZeroUnlessPresent(values);
    }
    
    case 'teaspoons': {
      // 0.5 steps up to 3, then whole numbers
      const values: number[] = [];
      for (let i = 0.5; i <= 3; i += 0.5) {
        values.push(parseFloat(i.toFixed(1)));
      }
      for (let i = 4; i <= 20; i += 1) {
        values.push(i);
      }
      return prependZeroUnlessPresent(values);
    }
    
    case 'milliliters': {
      // Handle liters - if unit is liters, multiply values by 1000
      const isLiters = normalized.includes('liter') || normalized === 'l' || normalized === 'litre';
      const multiplier = isLiters ? 1000 : 1;
      
      // 10ml steps up to 100, then 25ml steps, then 50ml steps
      const values: number[] = [];
      for (let i = 10; i <= 100; i += 10) {
        values.push(i * multiplier);
      }
      values.push(125 * multiplier, 150 * multiplier, 200 * multiplier);
      for (let i = 250; i <= 500; i += 50) {
        values.push(i * multiplier);
      }
      values.push(750 * multiplier, 1000 * multiplier, 1500 * multiplier, 2000 * multiplier);
      return prependZeroUnlessPresent(values);
    }
    
    case 'grams': {
      // 10g steps up to 100, then 25g steps, then 50g steps
      const values: number[] = [];
      values.push(10, 25);
      for (let i = 50; i <= 100; i += 25) {
        values.push(i);
      }
      values.push(125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000);
      return prependZeroUnlessPresent(values);
    }
    
    case 'ounces': {
      // 0.5 steps up to 4, then whole numbers
      const values: number[] = [];
      values.push(0.25, 0.5, 0.75);
      for (let i = 1; i <= 4; i += 0.5) {
        values.push(parseFloat(i.toFixed(1)));
      }
      for (let i = 5; i <= 32; i += 1) {
        values.push(i);
      }
      return prependZeroUnlessPresent(values);
    }
    
    default: {
      // Unknown unit - use generic increments
      // Try to infer from current amount
      if (currentAmount < 1) {
        // Small amounts - use 0.25 increments
        const values: number[] = [];
        for (let i = 0.25; i <= 5; i += 0.25) {
          values.push(parseFloat(i.toFixed(2)));
        }
        for (let i = 5.5; i <= 20; i += 0.5) {
          values.push(parseFloat(i.toFixed(1)));
        }
        return prependZeroUnlessPresent(values);
      } else if (currentAmount < 10) {
        // Medium amounts - use 0.5 increments
        const values: number[] = [];
        for (let i = 0.5; i <= 10; i += 0.5) {
          values.push(parseFloat(i.toFixed(1)));
        }
        for (let i = 11; i <= 20; i += 1) {
          values.push(i);
        }
        return prependZeroUnlessPresent(values);
      } else {
        // Large amounts - use whole numbers
        const values: number[] = [];
        for (let i = 1; i <= 50; i += 1) {
          values.push(i);
        }
        return prependZeroUnlessPresent(values);
      }
    }
  }
}

/**
 * Finds the closest value in the picker values array to the current amount
 */
export function findClosestValue(values: number[], target: number): number {
  if (values.length === 0) return target;
  
  let closest = values[0];
  let minDiff = Math.abs(values[0] - target);
  
  for (const value of values) {
    const diff = Math.abs(value - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = value;
    }
  }
  
  return closest;
}

