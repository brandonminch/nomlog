## Nomlog — Project Context For Claude

**Date:** 2026-03-20  
**Scope:** `nomlog-app` (mobile) + `nomlog-api` (backend) + `nomlog-web` + `docs/` (product/roadmap/specs/plans)

---

### 1. What Nomlog is
Nomlog is a React Native (Expo) meal-logging app that lets users describe meals conversationally and get nutrition analysis. Logged meals feed daily totals, weekly statistics, and water tracking. It also supports editing meals (including ingredient amounts), favorites, and reminder notifications.

User-facing loop (high level):
1. Sign in with Supabase
2. On first use, complete chat-first onboarding to set goals/targets
3. Log meals via conversational chat (with optional clarifying questions)
4. Optionally plan upcoming meals via chat (single meals or a full week; powered by a curated recipe catalog)
5. Review nutrition totals + weekly stats
6. Optionally get meal reminders and maintain settings/goals

---

### 2. Repo layout (where to look)
This workspace contains:

1. `nomlog-app/`  
   Expo + React Native + TypeScript app.
   - Navigation: Expo Router
   - State & data fetching: Zustand + React Query
   - Key directories:
     - `src/screens/` — app flows (Home, Chat, Onboarding, Meal Log detail, etc.)
     - `src/components/` — UI pieces (meal cards, modals, charts, etc.)
     - `src/lib/` — API client + shared types/errors

2. `nomlog-api/`  
   Express + TypeScript API for nutrition analysis, search, reminders, and persistence.
   - Uses LangChain and OpenAI for meal/nutrition analysis
   - Uses embeddings for semantic search
   - Uses Supabase for auth + database + realtime
   - Uses OneSignal for push reminders

3. `docs/`  
   Product inventory + roadmap + feature specs + engineering specs/plans.
   - `docs/FEATURES.md` — feature inventory + completeness matrix
   - `docs/features/*.md` — one doc per feature area (auth, meal logging, nutrition, etc.)
   - `docs/roadmap/roadmap.md` — near-term plan
   - `docs/specs/`, `docs/plans/` — design specs and implementation plans

4. **Monorepo (pnpm + Turborepo)**  
   Install and run tasks from the **repository root** with [pnpm](https://pnpm.io): `pnpm install`, then `pnpm run lint` / `typecheck` / `build` (see root `package.json`). Use `pnpm --filter <package-name> <script>` for a single app.

---

### 3. Architecture (systems and responsibilities)

#### Mobile app (`nomlog-app`)
- Presents the UI for meal logging, review, stats, settings, and notifications toggles.
- Talks to the backend via `src/lib/api` (`apiClient`).
- Uses:
  - React Query for server data (meal logs ranges, favorites, recent meals, etc.)
  - Zustand auth store for session token

#### Backend (`nomlog-api`)
- Provides REST endpoints the app calls for:
  - Meal analysis and log creation
  - Meal retrieval (by date/time window, by id)
  - Favorites management
  - Recent meal suggestions (semantic-ish search using embeddings + a time-window query)
  - Planned meal flows and reminder scheduling
- Background jobs:
  - Reminder cron job checks user local times and sends OneSignal notifications near meal times.

---

### 4. Current feature coverage (what’s implemented)
From `docs/FEATURES.md` (and reinforced by current screen implementations):

**Fully implemented (✅)**
- User authentication (Supabase)
- Conversational onboarding (chat-first; collects goals, stats, activity level; resumes at last step)
- Conversational meal logging (with AI analysis)
- Edit meal (time + analysis/ingredients from “Edit meal” flow)
- Nutrition analysis (preview + ingredients-level display)
- Daily nutrition tracking
- Weekly statistics
- Water tracking
- Meal search / discovery (semantic recent meals)
- Push notifications (meal reminders)
- User settings
- Real-time sync
- Error handling / retry (documented feature; exact runtime behavior may vary by endpoint)
- Planned meals (pre-logged; counts only when logged)
- Meal planning via chat (single-meal suggestions, weekly plans, in-chat review/replace, recipe detail view, planned meal integration, recipe URL import; backed by curated recipe catalog)

**Partially implemented (⚠️)**
- Nutrition goals (backend exists; UI may be limited)
- Weight tracking (data model exists; UI may be limited)
- Activity logging (UI entry point in home screen `ActivityGroupCard` + chat logger picker; shows “Coming soon”; no backend yet)

**Not implemented (❌)**
- Shopping lists and pantry-aware meal planning
- Food database browsing
- Social features
- Export/import data
- Barcode scanning
- Photo recognition
- Meal templates beyond favorites
- Deeper nutrition insights/trends beyond weekly stats
- Integrations with fitness trackers
- Recipe creation/management (URL import exists; full user-facing CRUD does not)

---

### 5. Key user flows (current UX in code)

#### A) Home / day view
**File:** `nomlog-app/src/screens/LogsScreen.tsx`
- Shows a week-based carousel (today + previous days), with a sticky header.
- Shows meal “buckets” (breakfast/lunch/dinner/snack) via `MealGroupCard`.
- Daily totals are computed excluding meals with `log.status === 'planned'`.
- Tapping an empty meal slot navigates to chat to log a meal:
  - `router.push({ pathname: '/chat', params: { dateString, mealType } })`
- Tapping an existing meal group navigates to the meal list detail:
  - `/meal-log-detail` (implemented as a wrapper around `MealLogDetailScreen`)
- Meal bucketing:
  - If a log has an explicit `meal_type`, it is used.
  - Otherwise bucket is inferred from time-of-day.
  - Planned logs are bucketed using `planned_for` (or `created_at`).

#### B) Meal log detail (list + card actions)
**Files:** `nomlog-app/app/meal-log-detail.tsx` and `nomlog-app/src/screens/MealLogDetailScreen.tsx`
- Route params: `dateString` + `mealType`
- Filters the logs for that date to the selected bucket.
- Shows daily totals for the selected meal type, excluding planned meals.
- Renders `MealLogCard` for each meal.

Card actions:
- **Edit meal** opens chat in edit mode:
  - `router.push({ pathname: '/chat', params: { mealLogId: mealLog.id, editMeal: 'true' } })`
- **Favorite / unfavorite** calls favorites endpoints (and invalidates relevant queries).
- **Planned meal “Log this Meal”** calls:
  - `POST /api/v1/logs/:mealLogId/log`

Meal details:
- `MealDetailModal` is a bottom sheet showing macro/micronutrient breakdown and ingredient/provenance context.

#### C) Chat (log + plan + edit)
**File:** `nomlog-app/src/screens/ChatScreen.tsx`
Chat is the central interaction model for:
- logging a new meal
- planning meals (single meal or a full week)
- editing an existing meal
- logging from a favorite or recent suggestion

Route params / modes:
- Uses Expo Router `useLocalSearchParams`:
  - `initialMessage?: string`
  - `mealLogId?: string`
  - `editMeal?: string` (treated as boolean-ish when `'true'`)
  - `logger?: 'meal' | 'activity'` — selects logger kind; defaults to `'meal'`
  - `mode?: 'log' | 'plan'` — selects meal chat mode; defaults to `'log'`
- Behavior:
  - If `mealLogId` is present, it loads the existing meal log for review/edit.
  - If `editMeal === 'true'`, it enters “edit mode” so analysis messages and ingredients refresh in place.
  - If `logger === 'activity'`, the chat shows an “Activity Logger” header and a “Coming soon” placeholder (no backend yet).
  - If `mode === 'plan'`, the chat switches to Meal Planner mode (see planner flow below).

Logger kind picker:
- A header button opens a menu to switch between “Meal Logger”, “Meal Planner”, and “Activity Logger”.
- Available when not in edit-meal mode.

Meal Planner mode:
- Triggered via `mode=plan` route param or by picking “Meal Planner” from the logger menu.
- Shows example prompts when the conversation is empty.
- Single-meal and weekly-plan requests call:
  - `POST /api/v1/planner/suggestions` (single meal)
  - `POST /api/v1/planner/week` (weekly plan)
  - `POST /api/v1/planner/replace` (replace one meal in a plan)
- Planner responses render as card-based suggestions inside the chat.
- Each planner card can open a recipe detail view and save the meal as a planned meal.

Suggestions / discovery:
- Before the user “commits” anything (initial state):
  - Shows a suggestions UI with:
    - **Recent meals** fetched from:
      - `GET /api/v1/logs/recent?days=30&hourStart=...&hourEnd=...&timezone=...&limit=5`
    - **Favorites** fetched from:
      - `GET /api/v1/logs/favorites`

Analysis and preview:
- Meal analysis uses:
  - `POST /api/v1/logs/summary`
  - Payload includes `mealDescription` and optionally `conversationHistory` when clarifying questions have been answered.
- The app handles multi-turn clarification:
  - The API can return a list of questions.
  - The chat asks questions one at a time.
  - The code limits this by design to a few questions (there is logic preventing indefinite Q/A; the UI stops after a maximum).
- After analysis, chat shows an “analysis/review card”:
  - includes name, ingredient list, assumptions (if provided)
  - allows ingredient amount editing (serving size/amount)
  - includes a date/time picker for logging time

Logging and planned meals:
- When submitting a log, the app chooses among endpoints based on whether it’s edit mode and whether the selected date is in the future:
  - `POST /api/v1/logs/create` (summary-based flow; full analysis payload)
  - `POST /api/v1/logs/simple` (when logged/known nutrition already exists)
  - `POST /api/v1/logs/planned` (creates a planned meal when logging far enough in the future)
  - Edit mode uses `PATCH /api/v1/logs/:id`

Important rules visible in code:
- The chat allows selecting a date up to ~6 months in the future.
- A “planned meal” is created when the selected time is more than ~15 minutes in the future (unless logging from an existing favorite where summary may be skipped depending on the path).

#### D) Onboarding (goals + targets)
**Files:** `nomlog-app/src/screens/OnboardingScreen.tsx` and `nomlog-app/src/hooks/useOnboardingFlow.ts`
- Chat-first onboarding collects:
  - name (optional)
  - primary goal (`lose_weight`, `maintain_weight`, `build_muscle`, `track_intake`, `training_event`)
  - age
  - height
  - weight
  - biological sex
  - activity level
- Resume capability:
  - `useOnboardingFlow` hydrates from existing profile data.
  - onboarding state is driven by `profile.has_completed_onboarding`.
- Completion:
  - `handleCompleteFromSummary` patches profile + stats and sets:
    - `has_completed_onboarding: true`

Target calculation:
- The nutrition target system is specified in:
  - `docs/prds/nomlog_nutrition_goal_system_spec.md`
  - uses Mifflin-St Jeor (BMR) + activity multipliers, then macro allocation strategy.

#### E) Stats / weekly view
**Files:** `nomlog-app/src/components/WeeklyStatsModal.tsx` and weekly stats hooks
- “Stats” tab shows a weekly macro view across a range (12 weeks).
- Uses a bottom-sheet modal and a swipeable carousel to switch weeks.

---

### 6. Backend endpoints (as used by the app)
The app currently calls (directly observed from screen code):
- Meal logs:
  - `POST /api/v1/logs` (logs via description + timestamp + mealType)
  - `POST /api/v1/logs/summary` (LLM summary/analysis for chat preview)
  - `POST /api/v1/logs/create` (commit meal using the summary + conversation context)
  - `POST /api/v1/logs/simple` (commit meal using already known nutrition + ingredients)
  - `POST /api/v1/logs/planned` (create planned meals)
  - `PATCH /api/v1/logs/:id` (edit a meal log)
  - `DELETE /api/v1/logs/:id` (delete meal log)

- Search / suggestions:
  - `GET /api/v1/logs/recent?...&limit=5` (recent meals around selected time-of-day)
  - `GET /api/v1/logs/favorites`

- Favorites:
  - `POST /api/v1/logs/:mealLogId/favorite`
  - `DELETE /api/v1/logs/:mealLogId/favorite`

- Favorites deletion:
  - `DELETE /api/v1/logs/favorites/:favoriteId`

- Planned meal promotion:
  - `POST /api/v1/logs/:mealLogId/log`

- Planner:
  - `POST /api/v1/planner/suggestions` (single-meal suggestions backed by curated recipe catalog)
  - `POST /api/v1/planner/week` (7-day weekly meal plan)
  - `POST /api/v1/planner/replace` (replace one meal in an existing plan)

- Recipes:
  - Recipe detail retrieval (used by planner detail view)
  - Recipe URL import (persists source metadata; called during planner chat when user pastes a URL)

- Reminder cron:
  - Reminder behavior is described in `nomlog-api/README.md` (Render Cron Job).

---

### 7. What we’ve got planned (roadmap)
From `docs/roadmap/roadmap.md`:

**Next**
- Re-submit meal if network error
- Basic analytics

**Later**
- Allow user to configure meal times, notifications, etc.
- Silence log reminder if user has already logged the meal for that reminder being sent for.
- Water reminders when the user hasn’t been logging any water.

---

### 8. Known constraints / “things to keep in mind” for Claude
- The app relies on real app state machines driven by route params (`/chat` for logging + editing).
- “Planned meals” are a first-class status that is excluded from daily totals until converted/logged.
- Chat preview is based on `/logs/summary`, while final persistence uses one of:
  - `/logs/create`, `/logs/simple`, or `/logs/planned` depending on path.
- The nutrition goal system is designed to be explainable now and extensible later (future adaptive TDEE is described in the PRD spec).

---

### 9. If you need help from Claude (recommended task framing)
When you ask Claude to make changes, specify which layer:
1. Product/UX behavior (screens + modals)
2. API contract and endpoint behavior (`nomlog-api`)
3. AI prompts / analysis pipeline in the backend (LangChain/OpenAI)
4. Data model consistency (Supabase tables + RLS assumptions)

If you want, tell me the exact thing you want Claude to do next (bug fix, feature, refactor, prompt tuning), and I’ll update this document to include the relevant subsystem details.

