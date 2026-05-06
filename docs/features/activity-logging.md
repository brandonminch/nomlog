# Activity logging

[← Feature index](../FEATURES.md)

## Overview

- **Chat (manual)**: In the activity logger, the **Chat** tab accepts free-text workouts (runs, strength sets, mixed sessions). The API returns a structured summary; the user can edit workout type, optional effort (`easy`, `hard`, `intense`), distance, duration, sets, reps, and weight, pick **when** the workout occurred, then **Log activity**. Manual entries enforce a minimum signal for burn quality (for example, cardio/HIIT requires distance or duration). After create, the API runs an async **calorie burn** estimate using the user profile (`user_profiles`: weight, height, biological sex) plus segment context (`schemaType`, optional `effort`) and updates `calories_burned` (and optional per-segment `energyKcal` on manual exercises).
- **Recent (Apple Health, iOS)**: The **Recent** tab lists Apple Health **workouts from the last 72 hours** that are not already saved in Nomlog, same as before. Import requires a **development or production native build** (`expo prebuild` / `expo run:ios` or EAS); it does not run in Expo Go.
- **Automatic Health import (iOS)**: In **Profile → Apple Health**, users can turn on **Log workouts automatically**. When enabled, Nomlog uploads qualifying HealthKit workouts (same 72-hour window and deduplication by `external_id` as the Recent tab) when the app becomes active and when HealthKit notifies the app of new workout data (`HKObserverQuery` + background delivery). A short cooldown avoids duplicate uploads if both paths fire close together. Android is unchanged (Health import remains unavailable there).
- **Logs day view**: The **Activities** row shows logged activities for that day (name and calories burned when present). The **+** control opens the activity logger with that **calendar day** as the default log time (via `dateString` + `logger=activity`). Tapping the **Activities** header (when there is at least one activity) opens the **activities day detail** screen (full list for that day). Tapping a row opens **activity item detail** (view/edit name, description, time, manual exercise fields; HealthKit segments read-only; delete).
- **Activities day detail** (`/activities-log-detail`): Full-screen list for one day’s activities; header shows total kcal burned and **+** to log with `logger=activity` + `dateString`.
- **Activity item detail** (`/activity-log-item-detail`): `GET` / `PATCH` / `DELETE` for a single log; structured exercise editor for `manual_exercise` segments (aligned with the chat summary card); async burn / **Estimating…** when `analysis_status` is `pending` or `analyzing`.
- **Calories**: Burned calories are displayed for awareness; they **do not** change the header daily calorie total or macro rings (intake-only).

## API

- `POST /api/v1/activity-logs/summary` — conversational parse only. Body: `activityDescription`, optional `conversationHistory`. Response: `{ summary }` with `name`, `description`, `items` (cardio / strength), `questions`, `assumptions`. Off-topic messages return a guardrail summary (`name`: `__ACTIVITY_CHAT_GUARDRAIL__`).
- `POST /api/v1/activity-logs/create` — create from chat confirmation. Body: `name`, `description`, `exercises`, `loggedAt`. Manual segments must satisfy minimums by schema type (cardio/HIIT: distance or duration; strength: sets/reps/weight or duration; custom: at least one measurable field). Inserts with `analysis_status: pending` and runs async burn analysis.
- `GET /api/v1/activity-logs/recent?limit=` — latest activity logs for the current user (newest `logged_at` first).
- `POST /api/v1/activity-logs` — create a log directly (e.g. HealthKit import): same shape as before; manual segments enforce the same minimums as chat creation; HealthKit segments are exempt. `analysis_status` is `completed` when calories are already known from the device, otherwise `pending` with async burn when needed.
- `PATCH /api/v1/activity-logs/:id` — update `loggedAt`, `name`, `description`, `caloriesBurned`, and/or `exercises`. When `exercises` includes manual segments, minimums are re-validated. Changing content (name, description, exercises) clears calories and sets `analysis_status` to `pending`, then re-queues burn unless the client sets `caloriesBurned` (locks to `completed`).
- `DELETE /api/v1/activity-logs/:id` — delete the log (user-scoped); `204` on success.
- `GET /api/v1/activity-logs/:id` — single log (response body is the row).
- `GET /api/v1/logs` — each day object includes an **`activities`** array alongside `meals` and `water`.

## Data model

- **`activities`**: Optional reusable templates (parity with `meals`); not wired in the primary flows yet.
- **`activity_logs`**: Logged instances with `exercises` as a flexible JSONB array (discriminated segments: HealthKit workout segment, quantity samples, **manual_exercise** with optional `schemaType`, optional `effort`, distance/duration fields, and `sets[]` for strength). Column **`analysis_status`** mirrors meal logs for async burn (`pending`, `analyzing`, `completed`, `failed`, `failed_max_retries`).

## Android

- HealthKit is iOS-only. On Android, **Recent** shows the same import-unavailable message; **Chat** manual logging still works.
