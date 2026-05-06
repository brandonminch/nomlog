# Meal Logging

[← Feature index](../FEATURES.md)

## Core Features

- **Conversational Meal Logging**
  - Natural language meal description input
  - Meal photo attach from camera or library in chat composer (up to 4 thumbnails, background upload to Supabase Storage, retry/remove controls)
  - Photo-first send flow: users can send just the photo or include optional text context; send is blocked while upload is in progress
  - Dedicated photo summary API (`POST /api/v1/logs/photo-summary`) runs vision analysis and then reuses the existing meal summary pipeline
  - Logged meals retain storage references to attached photos (`meal_logs.photo_storage_paths`) so attachments can be audited/reused later
  - **Background-safe chat summaries**: meal summary generation runs asynchronously (`POST /api/v1/logs/summary-async` + `GET /api/v1/logs/summary-async/:requestId`). If iOS backgrounds mid-request, the server continues processing and the client can resume when foregrounded or when a completion push is tapped.
  - Async completion push text is context-aware: it includes the clarifying question text when follow-up is needed, or a meal-summary-ready message when summary generation is complete.
  - AI-powered meal analysis with clarifying questions
  - Multi-turn conversation flow (up to 2-3 questions)
  - **Clarifying answers carousel**: when the assistant asks clarifying questions, the chat composer is replaced by an answers widget that:
    - Shows one question at a time with a `1 of N` carousel header and left/right navigation
    - Supports up to **2 clarifying questions at once** from the API
    - Enforces **single-detail questions** (one missing detail per question), avoiding combined multi-detail asks
    - Shows a single summary question in chat (for readability) while the modal presents the full individual questions
    - Defers the meal/workout summary card until clarifying questions are fully answered (no interim summary card while questions remain)
    - Shows up to **5** suggested answers that are intended to stay broad/generic (plus a custom text input)
    - Never includes generic catch-all suggestions like **Other** / **Custom** (free-text input already covers this)
    - Uses assumptions instead of asking when clear suggestion sets cannot be expressed in a compact group (2-5 options)
    - Falls back to normal chat input (no carousel) when there is only one clarifying question and no suggested answers
    - Auto-advances after selecting/entering an answer
    - Batches all answers into a single user message (`Q: ... / A: ...`) when the last question is answered
    - Can be closed to restore the normal chat input without sending
  - Real-time meal summary preview before logging
  - **Save as favorite from summary**: On the meal summary card when logging a **new** meal (not edit-meal, not create-favorite-template, not logging from an existing favorite template), an optional **Save as favorite meal** control appears. If checked, after the meal log is created (including **planned** meals from the summary flow), the client calls `POST /api/v1/logs/:id/favorite` so a reusable template is added to Favorite meals without an extra step.
  - **Custom title before first log**: On the summary card when creating a new meal (not edit-meal mode), the user can edit the **meal name** inline; the model’s one-line blurb stays visible as read-only. If the saved title differs from the summary model’s name, the client sends `lockMealDisplayName` on create and the row stores `lock_meal_display_name` so the async nutrition step **does not replace** the display title (final description and macros still come from full analysis).
  - Ingredient-level editing (serving amounts/units) before confirmation; amount **0** removes that ingredient from the saved log (picker includes 0). At least one non-zero ingredient is required to log or update. The meal **description** is kept in sync with the remaining ingredients (comma-separated amounts) so removed lines do not linger in prose.

- **Meal Log Creation**
  - Create meal logs with natural language descriptions
  - Automatic nutrition analysis via OpenAI
  - Async nutrition calculation (non-blocking)
  - Support for custom logged timestamps (backdating)
  - Original description preservation for retry/audit

- **Meal Log Management**
  - View meal logs by date (timezone-aware)
  - 7-day carousel view (today + 6 previous days)
  - **Edit logged meals (overflow menu)** — real `meal_log` rows only (not favorite templates):
    - **Edit in chat** opens chat with the meal loaded (`editMeal=true`); users can change **time**, **meal name**, and **description** on the summary card, refine ingredients and amounts via chat, then tap **Update meal**. Closing the chat with unsaved edits prompts to discard or keep editing. Custom name/description are preserved across follow-up LLM summary refinements until the user changes them again. **Metadata-only saves** (unchanged ingredient lines) use `skipAnalysis` so nutrition is not re-analyzed; changing any ingredient line triggers async nutrition refresh. **`skipIconSelection`** on `PATCH /api/v1/logs/:id` skips icon re-selection when the client wants a lighter save.
    - **Edit manually** opens the inline editor (`/meal-log-edit`) to adjust **name**, **description**, **meal type** (breakfast / lunch / dinner / snack), **photos** (add/remove, up to four storage paths), and **total nutrition** (macros and micronutrients) without chat. Saves use `skipAnalysis: true` and `skipIconSelection: true` so there is **no** nutrition re-analysis or icon LLM on save. `PATCH /api/v1/logs/:id` accepts **`photoStoragePaths`** (user-owned paths or `null`). Ingredient breakdown is not edited on this screen; it stays as stored. If the log is linked to a **favorite**, the user can **update the favorite template and this log** (second `PATCH` to `favorites/:id` with the same `skipAnalysis` / `skipIconSelection` behavior) or **update this log only** (unlink favorite on the log `PATCH`). **Back** or **swipe-to-go-back** with unsaved field changes prompts **Keep editing**, **Don't save**, or **Save**; choosing **Save** may still show the favorite follow-up when applicable.
  - **Edit favorite templates** (Profile → Favorite meals): overflow shows **Edit in chat** and **Edit manually** (`/meal-log-edit` with `favoriteId`). Manual edit adjusts **name**, **description**, **photos** (up to four paths), and **total nutrition** with `skipAnalysis` / `skipIconSelection`; there is **no meal type** on the template (the slot is chosen when the user logs). Favorite templates store photos on `meals.photo_storage_paths` (copied when favoriting a log, editable on the template, and copied onto new logs when logging from the favorite unless the create payload already includes photos).
  - Delete meal logs
  - View individual meal log details

- **Favorite meals (saved templates)**
  - Users save a **favorite** from a meal card’s overflow menu (`Favorite this meal`). Favorites are stored as reusable meal templates (`meals` + `favorites` join; not tied to a specific day’s log row).
  - **Profile → Favorite meals** opens a dedicated list (`/favorite-meals`) sorted by name. The header **+** opens chat with `createFavorite=true` to build a new template via the same summary → full-analysis flow **without** creating a `meal_log` (`POST /api/v1/logs/favorites`). Rows use the same meal card UI as the day meal bucket; the card time shows an em dash for templates (no log timestamp). Template rows expose `analysis_status` like logs (pending/analyzing/completed/failed) while async nutrition runs.
  - Tapping a card opens **favorite meal detail** (`/favorite-meal-detail`) with the same title, ingredients, and nutrition sections as single meal log detail (detail header uses **no meal-type badge** and **—** for time; templates are not tied to a log timestamp). **Log this meal** opens chat with `favoriteId` only (logging flow). **Edit in chat** (overflow) opens chat with `favoriteId` + `editFavorite=true` to update the template only (`PATCH /api/v1/logs/favorites/:favoriteId`), using the same `skipAnalysis` rules as editing a log when ingredient lines are unchanged; **`skipIconSelection`** and **`photoStoragePaths`** are supported on that PATCH.
  - **Remove from favorites** deletes the favorite template (`DELETE /api/v1/logs/favorites/:id`). There is no separate “delete meal log” action on this screen because a template is not a `meal_log` record.

- **Planned meals**
  - Users can create meals in a **planned** state with a specific planned time.
  - Planned meals appear in the normal meal lists/cards but **do not count** toward daily/weekly nutrition totals.
  - Users can convert a planned meal to a logged meal by tapping **“Log this Meal”** (no chat required); after conversion it counts toward totals.
  - Planned meals can be edited via **Edit in chat** or **Edit manually** (inline) prior to logging, same as logged meals.

- **Meal Display**
  - Meal cards with name, description, and nutrition totals
  - Visual meal type indicators (breakfast/lunch/dinner/snack)
  - **Grouping by meal tag**: Meals are tagged at log time (breakfast, lunch, dinner, snack) and grouped by tag; legacy logs without a tag are bucketed by time of day
  - Ingredient breakdown display
  - Nutrition totals (calories, macros, micronutrients)

- **Context-aware logging**
  - **From empty meal slot**: Tapping the plus on an empty meal group (current or past day) opens the log flow with that day and meal type pre-filled; the logged meal is tagged with that meal type. When logging for today, snacks default to the current time; for breakfast/lunch/dinner, if you tap within about an hour before or after your configured time, the meal is logged at the current time; otherwise it uses the configured meal time for that day.
  - **From nav bar**: Logging from the main input infers the meal tag from the current time of day using the user’s configured meal times (breakfast/lunch/dinner)
  - Users can backdate by opening a past day and tapping an empty slot to log for that day and meal
  - **Chat route (`/chat`)**: Optional query param `logger=meal` or `logger=activity` selects which logger opens (meal vs activity). Ignored when opening chat to edit an existing meal (`mealLogId` / edit flow), which always uses the meal logger.
  - **Activities**: See [activity-logging.md](activity-logging.md) for Apple Health import, `activity_logs` API, and the logs day row.

## Technical Notes

- Meals are stored with an optional `meal_type` (breakfast, lunch, dinner, snack); grouping prefers this tag and falls back to time-based buckets for older logs
- `PATCH /api/v1/logs/:id` can update `photoStoragePaths` (validated user-owned storage paths) and honor `skipIconSelection` alongside `skipAnalysis`
- Favorite templates (`meals`) use `photo_storage_paths`; `PATCH /api/v1/logs/favorites/:id` accepts `photoStoragePaths` with the same validation; listing/detail favorites APIs return template photo paths
- Two-step analysis: lightweight summary → full nutrition analysis
- Analysis status tracking (pending, analyzing, completed, failed)
- Retry mechanism for failed analyses (up to 3 attempts)
- Vector embeddings for semantic search
