/**
 * Plain-text meal description built only from ingredient lines (amount + unit + name).
 * Keeps the stored description aligned with the ingredient list when users remove lines (e.g. amount 0).
 */
export function mealDescriptionFromIngredients(
  ingredients: ReadonlyArray<{ servingAmount: number; servingUnit: string; name: string }>
): string {
  return ingredients
    .map((ing) => `${ing.servingAmount} ${ing.servingUnit} ${ing.name}`.trim())
    .join(', ');
}
