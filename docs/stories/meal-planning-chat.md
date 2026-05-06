---
feature: meal-planning-chat
area: Meal Planning Chat
source_doc: ../features/meal-planning.md
---

# Meal Planning Chat Stories

## Backlog

---

## MP-001: Enter meal planning mode from chat

---
id: MP-001
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user already using NomLog chat
**I want** to switch from logging mode into planning mode
**So that** I can ask what I should eat next instead of only logging what I already ate.

### Acceptance criteria

- [ ] The chat experience exposes a clear affordance to enter meal planning mode.
- [ ] Planning mode has distinct title, helper copy, or empty state so it is clearly different from meal logging.
- [ ] I can switch back to logging mode without getting stuck in planner-specific UI.
- [ ] Entering planning mode does not require leaving the current chat surface.

### Implementation notes (optional)

- Current route/logger parsing only supports `meal` and `activity`; this story may require a new mode abstraction or a planner-specific branch inside the existing chat screen.
- Preserve flexibility around whether this becomes a third logger or a segmented sub-mode.

### Figma prompt (optional)

> Design a lightweight mobile chat header and mode switch for NomLog that lets a user move between meal logging and meal planning. Show the default logging state, the selected planning state, and a simple empty planning state with prompt examples like dinner tonight and weekly meal plan.

---

## MP-002: Get personalized single-meal suggestions

---
id: MP-002
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** to ask for a meal idea in natural language
**So that** I can quickly choose something that fits my goals and constraints.

### Acceptance criteria

- [ ] The planner supports prompts like dinner tonight, lunch tomorrow, or high-protein easy-prep meal ideas.
- [ ] The response returns a small set of options, ideally 2-4, instead of an overwhelming list.
- [ ] Each option includes a clear meal name and short explanation of why it fits.
- [ ] When relevant profile goals exist, the suggestions are framed in a personalized way.
- [ ] If required context is missing, the planner asks a lightweight follow-up or communicates that suggestions are more generic.

### Implementation notes (optional)

- This likely needs a different response shape than the existing meal logging summary flow.
- Reuse the current user profile nutrition targets where available instead of requiring new profile fields for MVP.

### Test cases (optional)

- [ ] A user asking for a high-protein lunch receives suggestions that are explicitly framed around protein.
- [ ] A user without nutrition targets receives generic suggestions plus a clear note that recommendations are less personalized.

---

## MP-003: Save a suggested meal as a planned meal

---
id: MP-003
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** to save a suggested meal for a day and meal slot
**So that** my choice becomes part of my upcoming plan.

### Acceptance criteria

- [ ] Each suggested meal has an action to save it as a planned meal.
- [ ] I can confirm or adjust the target date and meal slot before saving.
- [ ] The resulting saved item uses NomLog's planned meal concept rather than creating a separate invisible draft.
- [ ] Saving a planned meal does not force me through the full logging confirmation flow.

### Implementation notes (optional)

- Reuse existing planned meal storage and status semantics where possible.
- Meal cards should carry enough structured data to support a lightweight save action.

### Test cases (optional)

- [ ] Saving a suggested dinner for tomorrow makes it appear in the planned state for that day and meal slot.
- [ ] Editing the save target before confirmation stores the meal under the selected slot, not the originally suggested one.

---

## MP-004: Generate a meal plan for up to 1 week

---
id: MP-004
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** to generate a simple meal plan covering several days
**So that** I can reduce decision fatigue and stay aligned to my goals.

### Acceptance criteria

- [ ] The planner supports meal plans from 1 day up to 7 days maximum.
- [ ] If I ask for more than 7 days, the planner clearly limits the plan to 1 week.
- [ ] The result is organized by day and meal time in a format that is easy to scan.
- [ ] The generated plan avoids overly large or difficult-to-review responses.
- [ ] The plan can be reviewed before I commit to saving all meals.

### Implementation notes (optional)

- Consider generating a structured payload that the UI can render as day-grouped meal cards rather than plain assistant text.
- MVP does not need to solve shopping lists or pantry optimization.

### Test cases (optional)

- [ ] Asking for a week of meals returns a plan with no more than 7 days.
- [ ] Asking for 10 days returns a polite limit message plus a 7-day plan option.

---

## MP-005: Review a meal plan in lightweight cards and list views

---
id: MP-005
status: done
priority: P1
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** a lightweight visual review of my meal options and plan
**So that** I can scan, compare, and act quickly on mobile.

### Acceptance criteria

- [ ] Single-meal suggestions render as lightweight meal cards with key details and primary actions.
- [ ] Weekly plans render in a simple day-grouped list or card view that is easy to scan on mobile.
- [ ] Cards surface only the most important information, such as meal name, timing, short nutrition framing, and actions.
- [ ] The review UI feels chat-first and does not turn into a dense form or spreadsheet.

### Implementation notes (optional)

- This should likely reuse existing card styling patterns where possible, while introducing planner-specific actions.
- Keep the visual system intentionally light because chat remains the primary interaction model.

### Figma prompt (optional)

> Design a mobile meal planning review UI for NomLog that appears within a chat-first experience. Show lightweight meal cards for single suggestions and a weekly plan list grouped by day and meal slot. Include actions for save, replace, swap, and recipe. Keep styling minimal and easy to scan.

---

## MP-006: Replace or swap meals inside the plan

---
id: MP-006
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** to replace or swap meals I do not like
**So that** I can refine a plan without regenerating everything from scratch.

### Acceptance criteria

- [ ] I can ask for another option for a specific meal in the plan.
- [ ] I can swap a meal while preserving the day and meal slot being edited.
- [ ] Replacing one meal does not discard the rest of the plan.
- [ ] The UI clearly indicates which meal is currently being modified.
- [ ] Multiple rounds of refinement are supported in the same planning session.

### Implementation notes (optional)

- Planner state must preserve enough structure to target a single meal replacement.
- Replacement flows should carry forward the original intent when possible, such as high protein or easy prep.

### Test cases (optional)

- [ ] Replacing Tuesday lunch changes only Tuesday lunch.
- [ ] Asking for another option after a replacement still keeps the user inside the same plan review flow.

---

## MP-007: View recipe details from a meal card

---
id: MP-007
status: done
priority: P1
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** to open recipe details from a suggested or planned meal
**So that** I can understand what I would actually make before choosing it.

### Acceptance criteria

- [ ] Meal cards expose a clear action to view recipe details.
- [ ] Recipe content opens in its own view rather than expanding excessively inside chat.
- [ ] The recipe view includes ingredients and high-level steps at minimum.
- [ ] I can return from the recipe view to the same planner context without losing my place.

### Implementation notes (optional)

- MVP may use a lightweight recipe representation attached to planned suggestions before introducing a full recipe domain.
- Clarify whether recipe data is generated, structured, or fetched from another system before implementation.

### Figma prompt (optional)

> Design a simple mobile recipe detail view launched from a meal planning card in NomLog. Show recipe title, serving context, ingredient list, and concise step-by-step instructions. Include a clear back action to return to the planner review state.

---

## MP-008: Planner nutrition guardrails and fallback behavior

---
id: MP-008
status: done
priority: P1
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** user
**I want** clear behavior when my profile data or request is incomplete
**So that** I know how personalized the planner really is.

### Acceptance criteria

- [ ] If nutrition goals are missing, the planner explains the limitation in clear language.
- [ ] The planner can still provide generic suggestions when appropriate instead of hard failing.
- [ ] Weekly plan requests are capped at 7 days with a polite limit message.
- [ ] Nutrition framing is helpful but avoids false precision when source data is approximate.

### Implementation notes (optional)

- This story should define the minimum required profile fields for "personalized" mode versus fallback mode.
- Guardrails should be enforced consistently across both single-meal and weekly-plan requests.

### Test cases (optional)

- [ ] A user without macro targets sees a clear fallback message before generic suggestions are shown.
- [ ] A user requesting more than 7 days gets a capped result and a clear explanation.

---

## MP-009: Capture planner feedback signals for future personalization

---
id: MP-009
status: done
priority: P2
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As a** product team
**I want** to capture basic feedback signals from planner interactions
**So that** future versions can personalize recommendations better.

### Acceptance criteria

- [ ] The system can distinguish between accepted, discarded, replaced, and swapped meal suggestions.
- [ ] Signals are captured without requiring a full taste profile flow in MVP.
- [ ] Captured signals are available for future recommendation refinement work.
- [ ] The MVP does not claim advanced taste personalization before those signals are actually used.

### Implementation notes (optional)

- This can begin as event tracking or lightweight persistence rather than a complete preference model.
- Keep scope narrow: capture useful signals now, apply them later.

---

## MP-010: Define meal planning architecture and API contracts

---
id: MP-010
status: done
priority: P1
type: tech-spike
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
---

**As an** engineering team
**I want** a clear architecture decision for meal planning mode
**So that** implementation can reuse existing chat and planned meal systems without creating avoidable complexity.

### Acceptance criteria

- [ ] The team decides whether meal planning is a third logger, a chat sub-mode, or a separate planner route that reuses chat components.
- [ ] Required request and response contracts are documented for single-meal suggestions, weekly plans, replacements, and recipe details.
- [ ] The design identifies which existing planned meal APIs and models can be reused directly.
- [ ] The design identifies which current logging-specific assumptions in chat must be separated for planner mode.

### Implementation notes (optional)

- Current chat code is heavily oriented around meal logging summaries and planned meal save behavior, so this spike should identify the cleanest seam for planner-specific state and rendering.
- Include a recommendation for how structured planner responses will be rendered in UI.

---

# Suggested Implementation Tickets

These tickets break the stories above into concrete app and API delivery slices that can be built in sequence.

## Recommended Phases

### Phase 1: Planner mode foundation

Goal: create the planner shell inside chat and support the first end-to-end single-meal planning flow.

- `MPT-001` - Add meal planning mode routing and chat shell
- `MPT-002` - Introduce planner message and session state types
- `MPT-003` - Build single-meal planner suggestion endpoint
- `MPT-004` - Render suggestion cards and save to planned meal
- `MPT-008` - Add planner guardrails and profile fallback UX

Exit criteria:
- User can switch from log to plan in chat
- User can ask for a single meal suggestion and receive structured planner cards
- User can save a suggested meal as a planned meal
- Planner handles missing profile data and MVP request limits clearly

### Phase 2: Weekly planning MVP

Goal: expand the planner from one-off meal help into a usable weekly planning experience.

- `MPT-005` - Build weekly plan endpoint and review UI
- `MPT-006` - Implement targeted replace and swap flows
- `MPT-010` - Extend planned-meal update support for planner workflows

Exit criteria:
- User can generate a plan for up to 7 days
- User can review the plan in a lightweight grouped layout
- User can replace or swap a specific meal without regenerating the whole plan
- Saved planner meals can be updated cleanly as planner interactions evolve

### Phase 3: Recipe and future-learning hooks

Goal: round out the MVP with recipe detail and lay the groundwork for future personalization.

- `MPT-007` - Add recipe detail contract and screen
- `MPT-009` - Persist planner feedback signals

Exit criteria:
- User can open a dedicated recipe detail view from planner cards
- Planner interactions emit reusable feedback signals for future personalization work

### Suggested first release cut

If we want the fastest useful release, ship **Phase 1** first as the initial MVP cut, then treat **Phase 2** as the weekly-planning expansion and **Phase 3** as quality and future-learning follow-up.

## MPT-001: Add meal planning mode routing and chat shell

---
id: MPT-001
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-001-enter-meal-planning-mode-from-chat
---

**As an** engineer
**I want** a distinct meal planning mode in the existing meal chat surface
**So that** planner-specific behavior can be introduced without breaking meal logging flows.

### Acceptance criteria

- [ ] Chat supports a route or local state distinction between `log` and `plan` while preserving the existing meal vs activity logger behavior.
- [ ] Entering planner mode changes the title, helper copy, and empty state to meal-planning language.
- [ ] Locked edit-meal flows continue to force the existing meal logging experience.
- [ ] Users can switch between log and plan from the same chat surface.

### Implementation notes (optional)

- Likely app files: `nomlog-app/src/utils/chatRouteParams.ts`, `nomlog-app/app/chat.tsx`, `nomlog-app/src/screens/ChatScreen.tsx`.
- Recommended approach: keep `logger=meal` and add a second chat mode such as `mode=plan`.

## MPT-002: Introduce planner message and session state types

---
id: MPT-002
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-002-get-personalized-single-meal-suggestions
  - #mp-004-generate-a-meal-plan-for-up-to-1-week
  - #mp-006-replace-or-swap-meals-inside-the-plan
---

**As an** engineer
**I want** planner-specific client state and message types
**So that** structured meal suggestions and weekly plans are rendered cleanly in chat.

### Acceptance criteria

- [ ] The app has typed planner payloads separate from the existing logging `ConversationSummary` shape.
- [ ] The message renderer supports planner-specific content such as single-meal suggestions and weekly plan blocks.
- [ ] Planner session state preserves enough structure to target a specific meal for replace or swap actions.
- [ ] Planner state survives opening and closing recipe detail without losing place.

### Implementation notes (optional)

- Likely new app files: `nomlog-app/src/types/planner.ts`, `nomlog-app/src/hooks/usePlannerSession.ts`.
- Consider extracting planner rendering from `ChatScreen.tsx` early to avoid further growth in a large file.

## MPT-003: Build single-meal planner suggestion endpoint

---
id: MPT-003
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-002-get-personalized-single-meal-suggestions
  - #mp-008-planner-nutrition-guardrails-and-fallback-behavior
---

**As an** engineer
**I want** a dedicated planner suggestion API
**So that** meal planning uses structured recommendation responses instead of the meal logging summary contract.

### Acceptance criteria

- [ ] The API exposes a planner endpoint for natural-language single-meal suggestion requests.
- [ ] The endpoint uses profile calories, macros, activity level, and goal context when available.
- [ ] The response returns a small set of structured meal options suitable for card rendering.
- [ ] The endpoint returns clear fallback messaging when profile data is incomplete.

### Implementation notes (optional)

- Likely backend files: `nomlog-api/src/routes/planner.ts`, `nomlog-api/src/services/mealPlanningService.ts`, `nomlog-api/src/types/planner.ts`.
- Keep this separate from `/api/v1/logs/summary`, which is optimized for analyzing meals the user already ate.

## MPT-004: Render suggestion cards and save to planned meal

---
id: MPT-004
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-002-get-personalized-single-meal-suggestions
  - #mp-003-save-a-suggested-meal-as-a-planned-meal
  - #mp-005-review-a-meal-plan-in-lightweight-cards-and-list-views
---

**As an** engineer
**I want** planner suggestion cards with a save action
**So that** users can move from recommendation to a persisted planned meal quickly.

### Acceptance criteria

- [ ] Single-meal planner responses render as lightweight cards in chat.
- [ ] Each card includes a save action that lets the user confirm or adjust day and meal slot.
- [ ] Saving reuses the existing planned meal persistence flow where possible.
- [ ] Save actions do not route the user through the meal logging summary confirmation flow.

### Implementation notes (optional)

- Likely new app files: `nomlog-app/src/components/planner/PlannerSuggestionCard.tsx`.
- Reuse `POST /api/v1/logs/planned` where possible.

## MPT-005: Build weekly plan endpoint and review UI

---
id: MPT-005
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-004-generate-a-meal-plan-for-up-to-1-week
  - #mp-005-review-a-meal-plan-in-lightweight-cards-and-list-views
---

**As an** engineer
**I want** a structured weekly plan contract and renderer
**So that** users can review up to 7 days of planned meals in a scannable format.

### Acceptance criteria

- [ ] The API returns a structured weekly meal plan grouped by day and meal slot.
- [ ] Requests over 7 days are rejected or capped with a clear limit response.
- [ ] The app renders the weekly plan in a lightweight grouped list or card view.
- [ ] Users can review the plan before saving meals into planned state.

### Implementation notes (optional)

- Likely new files: `nomlog-app/src/components/planner/WeeklyPlanReview.tsx`.
- Likely backend addition: `POST /api/v1/planner/week`.

## MPT-006: Implement targeted replace and swap flows

---
id: MPT-006
status: done
priority: P0
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-006-replace-or-swap-meals-inside-the-plan
---

**As an** engineer
**I want** targeted meal replacement and swap actions
**So that** users can refine a plan without regenerating the entire week.

### Acceptance criteria

- [ ] Each meal in a structured plan has a stable identifier or slot key for replace and swap requests.
- [ ] The app can request a replacement for a specific day and meal slot.
- [ ] Replacing one meal preserves the rest of the current plan.
- [ ] The UI clearly reflects which meal is being changed.

### Implementation notes (optional)

- Likely backend addition: `POST /api/v1/planner/replace`.
- Use stable slot identifiers such as `YYYY-MM-DD|mealType` or server-generated meal refs.

## MPT-007: Add recipe detail contract and screen

---
id: MPT-007
status: done
priority: P1
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-007-view-recipe-details-from-a-meal-card
---

**As an** engineer
**I want** planner meals to expose recipe detail data and a dedicated detail view
**So that** users can inspect how to make a meal without losing planner context.

### Acceptance criteria

- [ ] Planner responses expose enough recipe detail to render a dedicated detail view.
- [ ] The app provides a recipe detail screen or modal launched from a planner meal card.
- [ ] Users can return to the planner session without losing their place.
- [ ] Recipe detail includes ingredients and high-level steps at minimum.

### Implementation notes (optional)

- Likely backend addition: `POST /api/v1/planner/recipe` unless recipe content is embedded in suggestion responses.
- Likely app files: `nomlog-app/src/components/planner/PlannerRecipeModal.tsx` or `nomlog-app/app/planner-recipe.tsx`.

## MPT-008: Add planner guardrails and profile fallback UX

---
id: MPT-008
status: done
priority: P1
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-008-planner-nutrition-guardrails-and-fallback-behavior
---

**As an** engineer
**I want** consistent fallback and validation rules across planner requests
**So that** the planner behaves clearly when personalization inputs are missing or requests exceed MVP limits.

### Acceptance criteria

- [ ] Missing goal data produces clear fallback messaging rather than silent degradation.
- [ ] Weekly plans over 7 days are blocked or capped consistently.
- [ ] Nutrition framing avoids false precision when meal data is approximate.
- [ ] Guardrails apply to both single-meal suggestions and weekly plans.

### Implementation notes (optional)

- Shared validation should live in the planner API types layer rather than only in prompts.
- App copy should distinguish between personalized and generic suggestions.

## MPT-009: Persist planner feedback signals

---
id: MPT-009
status: done
priority: P2
type: story
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-009-capture-planner-feedback-signals-for-future-personalization
---

**As an** engineer
**I want** planner interactions to emit reusable feedback signals
**So that** future personalization work can learn from user behavior.

### Acceptance criteria

- [ ] The system records accepted, discarded, replaced, and swapped planner interactions.
- [ ] Feedback capture does not block the core planner response path.
- [ ] Stored events can be tied back to planner response items or meal slot identifiers.
- [ ] MVP captures signals without claiming active taste-model personalization yet.

### Implementation notes (optional)

- Likely backend addition: `POST /api/v1/planner/feedback` plus lightweight persistence.
- This can begin as analytics events or a small Supabase table.

## MPT-010: Extend planned-meal update support for planner workflows

---
id: MPT-010
status: done
priority: P1
type: tech-spike
feature: meal-planning-chat
links:
  - ../prds/meal-planning-chat.md
  - #mp-003-save-a-suggested-meal-as-a-planned-meal
  - #mp-006-replace-or-swap-meals-inside-the-plan
---

**As an** engineer
**I want** planner-specific planned meal updates to be supported cleanly
**So that** saved planner meals can be rescheduled or updated without awkward delete-and-recreate flows.

### Acceptance criteria

- [ ] The team decides whether existing log update endpoints can handle planner needs such as `planned_for` changes.
- [ ] Any API gap for updating planned meals is documented and resolved before broad planner rollout.
- [ ] The chosen update path preserves compatibility with current planned meal behavior.

### Implementation notes (optional)

- Review whether `PATCH /api/v1/logs/:id` needs to support `planned_for` or whether a planner-specific mutation is cleaner.
