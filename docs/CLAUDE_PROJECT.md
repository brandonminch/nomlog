# Nomlog - Project Context

## What is Nomlog?

Nomlog is a mobile nutrition and meal planning app. The core experience is conversational — users log meals, plan meals, and onboard through a chat interface powered by AI. The app tracks daily and weekly nutrition, supports water tracking, and sends meal reminders. It targets iOS and Android.

## Architecture

Nomlog is a monorepo with two main packages:

### nomlog-app (Frontend)
- **React Native / Expo** with TypeScript
- **Expo Router** for file-based navigation
- **Supabase JS** client for auth, realtime subscriptions, and direct DB reads
- **EAS Build** for cloud builds and distribution (TestFlight, etc.)
- Screens: Home (logs + daily tracking), Chat (meal logging and meal planning), Weekly Stats, Settings, Search, Recipe Detail, Onboarding

### nomlog-api (Backend)
- **Express.js** with TypeScript
- **Supabase** (PostgreSQL) for database, auth verification, Row Level Security, vector search, and realtime
- **OpenAI** (via LangChain) for meal analysis, nutrition estimation, planner suggestions, onboarding conversation, and embeddings
- **OneSignal** for push notifications
- Hosted on **Render**
- Swagger API docs
- Prompt templates stored in `src/prompts/`
- Curated recipe catalog stored in `src/data/`, seeded to DB via pipeline scripts

### Database (Supabase)
- PostgreSQL with Row Level Security
- Key tables: `user_profiles`, `meal_logs`, `recipes`, `water_logs`, `meal_reminders`
- Vector embeddings on meals and recipes for semantic search
- Supabase branching for dev/staging/production environments with GitHub integration
- Migrations in `nomlog-api/supabase/migrations/`

### Environments
- **Production** and **Develop** Supabase branches with separate credentials
- `.env.production` / `.env.development` files for both app and API
- Supabase GitHub integration auto-applies migrations on merge to main

## Core Features (Implemented)

### Conversational Meal Logging
The primary interaction. Users describe what they ate in natural language. The AI analyzes the meal, asks 1-3 clarifying questions, and presents a nutrition summary with editable ingredients. Users can adjust serving amounts before confirming. Meals are tagged by type (breakfast/lunch/dinner/snack) based on time of day or user selection.

### Meal Editing
Users can edit logged meals from a context menu. This reopens the chat with the meal loaded, allowing changes to time and ingredient amounts.

### Planned Meals
Meals can be saved in a "planned" state with a target date/time. Planned meals appear in the day view but don't count toward nutrition totals until the user taps "Log this Meal" to convert them.

### Meal Planning (Chat-Based)
A dedicated planner mode within the chat surface. Users can:
- Get single-meal suggestions (2-4 options) personalized to their goals
- Generate weekly meal plans (up to 7 days)
- Replace or swap individual meals within a plan
- View recipe details (ingredients, steps, nutrition) from suggestion cards
- Save suggestions directly as planned meals

Suggestions are grounded in a curated recipe catalog stored in the `recipes` table. Users can also import recipes by pasting a URL. The planner uses structured retrieval (meal type, timing, dietary signals) before OpenAI generates the final recommendations.

### Conversational Onboarding
Chat-first onboarding that collects goals, physical stats, and activity level, then computes personalized calorie and macro targets (Mifflin-St Jeor formula). Completes in under 3 minutes and guides the user into their first meal log. Progress persists across sessions.

### Nutrition Tracking
- Daily totals with circular progress wheels for calories and macros
- 12-week historical weekly stats with daily bar charts and weekly averages
- Personalized calorie and macro goals from onboarding

### Water Tracking
Daily water intake logging (glasses) with date-specific tracking on the home screen.

### Search
Semantic meal search using vector embeddings for similarity matching across logged meals.

### Push Notifications
Meal reminders (breakfast/lunch/dinner) via OneSignal, timezone-aware, with configurable times per meal.

### Settings
Timezone, reminder times, push notification toggle, nutrition goal display, weight, profile management.

## Partially Implemented

- **Nutrition goals UI** — Backend computes and stores goals; the settings UI for viewing/adjusting may need polish.
- **Weight tracking** — Data model exists on `user_profiles`; dedicated UI is limited.
- **Activity logging** — UI entry point exists (activities row on home screen, `logger=activity` chat route) showing "Coming soon." No backend, database table, or logging flow yet.

## Not Yet Built

- Shopping lists / pantry-aware planning
- Activity/workout logging and net calorie tracking
- Barcode scanning and photo recognition
- Recipe creation/management (beyond URL import)
- Social features and meal sharing
- Data export/import
- Fitness tracker integrations
- Advanced nutrition insights beyond weekly stats

## Project Direction

The app has a solid MVP for conversational meal logging, nutrition tracking, and AI-powered meal planning. Near-term focus areas include activity logging, nutrition goal UI refinement, and general polish. Longer-term ideas include shopping list generation from meal plans, workout planning, Siri integration, fasting support, and a nutrition coaching Q&A mode.

## Documentation Map

Detailed docs live in the `docs/` directory:
- `docs/FEATURES.md` — Feature index and completeness matrix
- `docs/features/` — One doc per feature area (auth, meal logging, meal planning, nutrition, etc.)
- `docs/prds/` — Product requirement documents for major features
- `docs/stories/` — User stories and implementation tickets per feature
- `docs/roadmap/` — Roadmap, ideas backlog, and architecture decision records
- `docs/deployment/` — Supabase branching and environment setup
