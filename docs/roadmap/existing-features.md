# Existing features (app + API)

Nomlog currently includes a full feature set for meal logging, nutrition analysis, and user settings. The app (React Native/Expo) talks to the Nomlog API (Express/TypeScript) and uses Supabase for auth, database, and realtime.

## App (nomlog-app)

- **Authentication** — Email/password via Supabase Auth; profile and sign out.
- **Meal logging** — Conversational meal entry with AI analysis, clarifying questions, and ingredient-level editing. Includes planned meals (pre-logged; count toward totals only when converted to logged) and meal editing via chat.
- **Meal planning** — Chat-based planner mode with single-meal suggestions and weekly plans up to 7 days. Suggestions are backed by a curated recipe catalog with structured retrieval. Users can review, replace/swap meals, view recipe detail, and save directly to planned meals.
- **Activity logging** — UI entry point exists (Activities row on logs screen, chat `logger=activity` route); shows "Coming soon"; no backend or logging implemented yet.
- **Nutrition** — Daily and weekly tracking, macro goals, progress wheels, 12-week stats.
- **Water** — Daily water intake (glasses) with date-specific logs.
- **Search** — Semantic meal search (vector similarity).
- **Notifications** — Meal reminders (breakfast/lunch/dinner) via OneSignal, timezone-aware.
- **Settings** — Timezone, reminder times, push toggle, nutrition goals, weight.

## API (nomlog-api)

- RESTful Express API with auth middleware, validation, and Swagger docs.
- Meal analysis (OpenAI), embeddings for search, web search for brands.
- Integrations: Supabase (DB, auth, realtime), OneSignal (push).

## Full inventory

The feature inventory is split into modular docs:

- **[../FEATURES.md](../FEATURES.md)** — Index, completeness matrix, and roadmap notes.
- **[../features/](../features/)** — One doc per feature area (auth, meal logging, nutrition, etc.).

Use these for roadmap planning, gap analysis, and launch readiness.
