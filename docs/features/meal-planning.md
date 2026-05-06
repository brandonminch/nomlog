# Meal Planning

[← Feature index](../FEATURES.md)

## Core Features

- **Chat-based meal planning**
  - Users can switch the meal chat into planning mode without leaving the chat surface.
  - The planner supports single-meal suggestions and weekly meal plans up to 7 days.
  - Planner responses stay lightweight and card-based inside the chat UI.

- **Curated recipe-backed suggestions**
  - Planner suggestions are grounded in Nomlog's internal curated recipe catalog by default.
  - In planner suggestions chat, if a user pastes a recipe URL, Nomlog attempts to import it into the shared recipe catalog and use it in future retrieval.
  - The starter catalog is versioned in-repo and imported into the `recipes` table through an explicit seed script.
  - Planner results preserve a `recipe_id` reference so planned meals can keep their recipe linkage.

- **Recipe detail view**
  - Suggested and weekly-plan meals can open a dedicated recipe detail view from the planner cards.
  - Recipe detail includes source attribution, ingredient lists, high-level steps, serving/yield context, and available timing metadata.
  - External publisher links are shown only when a recipe actually came from an external source.

- **Planned meal integration**
  - Source-backed suggestions can be saved directly into Nomlog's planned meal flow.
  - Weekly plan meals can be saved, replaced, and swapped while keeping their planner structure in chat.
  - Saved planned meals can persist the linked recipe reference alongside the planned meal record.

## Technical Notes

- Planner generation still uses OpenAI for ranking and explanation, but it now receives candidate recipes from a retrieval layer before generating meal cards.
- Natural-language prompts are shaped into structured retrieval intent (meal type + timing + nutrition/diet signals such as “high in protein”, “low carb”, “low fat”, “under X calories”, and “keto-ish”), so planner suggestions can better match user constraints without requiring exact wording.
- The default retrieval path queries curated recipes already stored in the first-class `recipes` table, including structured servings, meal types, and canonical ingredient names for future grocery-list use cases.
- URL imports persist source metadata (`source_name`, canonical + original URL) and first-saver attribution (`saved_by_user_id`) on the recipe record.
- External discovery remains optional future fallback behavior and is gated behind configuration instead of being required for planner results.
- Recipe detail is served through the API rather than embedding full instructions into every planner suggestion response.
