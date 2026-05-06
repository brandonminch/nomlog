# Nutrition Analysis & Tracking

[← Feature index](../FEATURES.md)

## Core Features

- **Comprehensive Nutrition Data**
  - Calories (kcal)
  - Macronutrients: Fat, Protein, Carbohydrates
  - Micronutrients: Fiber, Sugar, Sodium, Saturated Fat, Potassium, Cholesterol, Calcium, Iron, Vitamin A, Vitamin C, Vitamin D, Magnesium

- **Daily Nutrition Tracking**
  - Daily totals calculation (timezone-aware)
  - Macro progress tracking (protein, carbs, fat)
  - Visual progress indicators (circular progress wheels)
  - Goal-based progress display

- **Weekly Statistics**
  - 12-week historical view (swipeable carousel)
  - Daily macro breakdown bar charts
  - Weekly averages for protein, carbs, and fat percentages
  - Week-over-week comparison

- **Nutrition Goals**
  - Daily calorie goal setting
  - Daily macro goals (protein, carbs, fat)
  - **Manual editing** of calorie and macro targets (Profile → Daily goals → edit screen); saved values are not overwritten unless the user agrees to refresh targets after a profile change.
  - Goal progress visualization
  - Goal tracking per day

## Technical Notes

- Nutrition calculated per ingredient and aggregated.
- Serving size conversions (handfuls, cups, grams, etc.).
- Brand identification via web search.
- LLM-based estimates with confidence levels.
- Daily calorie and macro goals are computed from onboarding inputs using a Mifflin-St Jeor BMR, activity multipliers, goal-based calorie adjustments, and weight-based macro allocation as defined in `docs/prds/nomlog_nutrition_goal_system_spec.md`. Age in that pipeline comes from **date of birth** and the profile **timezone** (whole years).
- The API supports `recalculate_nutrition_targets` on profile PATCH: when the user already has a calorie goal, recalculation runs only if they confirm (or if they never had a calorie goal yet).
