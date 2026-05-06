---
feature: conversational-onboarding
area: Conversational Onboarding
source_doc: ../features/conversational-onboarding.md
---

# Conversational Onboarding Stories

## Backlog

---

## CO-001: Welcome and setup intro

---
id: CO-001
status: ready
priority: P1
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** to understand what NomLog does and why setup matters
**So that** I feel confident starting the onboarding flow.

### Acceptance criteria

- [ ] A friendly intro message is shown as the first step of onboarding.
- [ ] Tone is warm and conversational, not clinical.

### Implementation notes

- Chat interface using similar style and components to the meal logging interface where possible.

### Figma design

@https://www.figma.com/design/2wijfPW0ysRM5yMaGQGQdQ/nomlog?node-id=166-408&m=dev

---

## CO-002: Name collection

---
id: CO-002
status: ready
priority: P2
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** NomLog to ask what I'd like to be called
**So that** the conversation feels personal throughout onboarding.

### Acceptance criteria

- [ ] User is asked for their preferred name after the welcome message.
- [ ] Input is optional — skipping it moves the flow forward without a name.
- [ ] Provided name is used in subsequent onboarding messages.
- [ ] Name is persisted to the user profile.

### Implementation notes

- If skipped, fall back to a generic greeting (e.g. "you") for the rest of the flow.

### Figma design

@https://www.figma.com/design/2wijfPW0ysRM5yMaGQGQdQ/nomlog?node-id=166-408&m=dev

---

## CO-003: Goal selection

---
id: CO-003
status: ready
priority: P0
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** to choose my primary health goal
**So that** my nutrition targets are calculated with the right objective in mind.

### Acceptance criteria

- [ ] Five options are presented: Lose weight, Maintain weight, Build muscle, Track my intake, Training for an event.
- [ ] Each option has a short plain-language description.
- [ ] Only one goal can be selected.
- [ ] Selection is required — the flow does not advance without a choice.
- [ ] Selected goal is persisted and used in downstream calculations.

### Implementation notes

- Goal determines whether the Goal Speed step (CO-006) is shown — only for "Lose weight" and "Build muscle".
- "Maintain weight" → TDEE with balanced macros.
- "Track my intake" → TDEE with balanced macros; no pace question; framing is neutral (no deficit/surplus).
- "Training for an event" → TDEE with higher carb ratio; no pace question; may prompt for event type in a future iteration.
- Future: allow free-text input or more granular sub-goals.

### Figma design

@https://www.figma.com/design/2wijfPW0ysRM5yMaGQGQdQ/nomlog?node-id=167-432&m=dev

---

## CO-004: Physical stats collection

---
id: CO-004
status: ready
priority: P0
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** to enter my weight, height, age, and biological sex
**So that** my calorie and macro targets are accurate to my body.

### Acceptance criteria

- [ ] Stats are collected one at a time in a conversational sequence.
- [ ] User can enter weight and height in imperial (lbs, ft/in) or metric (kg, cm).
- [ ] Unit preference is remembered for the rest of the app.
- [ ] Age accepts a whole number (years).
- [ ] Biological sex is selectable (Male / Female / Prefer not to say) with a brief note on why it's needed for the calculation.
- [ ] Gentle validation rejects clearly out-of-range values (e.g. weight < 30 kg or > 300 kg).
- [ ] All four values are required; the flow does not advance until each is provided.

### Implementation notes

- Use Mifflin-St Jeor BMR formula (requires weight, height, age, sex).
- "Prefer not to say" averages the male and female BMR results for the given stats.
- Validation messages should be supportive, not alarming.
- Consider inline unit toggle rather than an upfront unit preference screen.

### Test cases

- [ ] Entering weight in lbs converts correctly for BMR calculation.
- [ ] Out-of-range values show a gentle re-prompt, not an error modal.

---

## CO-005: Activity level selection

---
id: CO-005
status: ready
priority: P0
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** to describe how active I am day-to-day
**So that** my calorie targets account for my energy expenditure.

### Acceptance criteria

- [ ] Activity levels are presented as clearly labeled options (e.g. Sedentary, Lightly active, Moderately active, Very active, Extremely active).
- [ ] Each level has a short plain-language description (e.g. "desk job, little exercise").
- [ ] A brief inline note explains why activity level matters.
- [ ] One level is required; flow does not advance without a selection.
- [ ] Selected level is used as the TDEE multiplier.

### Implementation notes

- Standard activity multipliers: Sedentary 1.2, Light 1.375, Moderate 1.55, Very active 1.725, Extra active 1.9.

---

## CO-006: Goal speed selection

---
id: CO-006
status: ready
priority: P1
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** user who wants to lose weight or build muscle
**I want** to choose how aggressively I pursue my goal
**So that** my calorie deficit or surplus matches my lifestyle.

### Acceptance criteria

- [ ] Step is only shown when goal is "Lose weight" or "Build muscle".
- [ ] Three options are presented: Conservative, Balanced, Aggressive.
- [ ] Each option includes a short explanation of the tradeoff (e.g. pace vs. sustainability).
- [ ] Language avoids extreme dieting terms (no "crash diet", "bulk", etc.).
- [ ] Selected pace maps to a specific calorie offset (e.g. −250 / −500 / −750 kcal for loss).

### Implementation notes

- For weight loss: Conservative −250, Balanced −500, Aggressive −750 kcal/day.
- For muscle gain: Conservative +150, Balanced +300, Aggressive +500 kcal/day.
- Ensure aggressive deficit never drops below a safe floor (~1200 kcal women / 1500 kcal men).

### Test cases

- [ ] Step is skipped entirely for Maintain weight, Track my intake, and Training for an event goals.
- [ ] Aggressive loss does not produce a target below the safe calorie floor.

---

## CO-007: Macro and calorie reveal

---
id: CO-007
status: ready
priority: P0
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user
**I want** to see my personalized daily calorie and macro targets
**So that** I know what I'm working toward.

### Acceptance criteria

- [ ] Screen displays: daily calories, protein (g), carbs (g), fat (g).
- [ ] Layout is visually scannable (e.g. large numbers, clear labels).
- [ ] Three actions are available: Accept targets, Adjust targets, How was this calculated?
- [ ] "How was this calculated?" shows a concise explanation without leaving the flow.
- [ ] Accepting targets saves them and advances to the first meal log prompt (CO-009).
- [ ] Adjusting targets enters the adjustment flow (CO-008).

### Implementation notes

- Default macro split (loss/maintain): ~30% protein, 40% carbs, 30% fat.
- Default macro split (gain): ~25% protein, 45% carbs, 30% fat.
- Recomposition: ~35% protein, 40% carbs, 25% fat.

---

## CO-008: Target adjustment flow

---
id: CO-008
status: ready
priority: P1
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** user who wants to customize my targets
**I want** to manually adjust my macro and calorie goals
**So that** the plan fits my preferences or dietary approach.

### Acceptance criteria

- [ ] User can edit each macro (protein, carbs, fat) individually.
- [ ] Calorie total updates in real time as macros are adjusted.
- [ ] Validation prevents physiologically unrealistic configurations (e.g. < 50 g protein, calories < safe floor).
- [ ] A "Reset to recommended" option is available at all times.
- [ ] Confirming saves the adjusted targets and advances to CO-009.

### Implementation notes

- Consider locking total calories and letting the user redistribute macros as percentages.
- Validation errors should appear inline, not as blocking modals.

### Test cases

- [ ] Setting protein below a minimum threshold shows a warning but does not block saving.
- [ ] "Reset to recommended" restores the values calculated in CO-007.

---

## CO-009: First meal log activation

---
id: CO-009
status: ready
priority: P0
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** new user who just completed setup
**I want** to be prompted to log my first meal immediately
**So that** I experience the core product value before leaving onboarding.

### Acceptance criteria

- [ ] After targets are accepted or adjusted, the user is prompted to log their first meal.
- [ ] An example input is shown to reduce friction (e.g. "Try: 'I had oatmeal with banana for breakfast'").
- [ ] Free-text meal logging is supported (consistent with the existing conversational logging flow).
- [ ] A successful log surfaces a summary that shows progress toward the day's targets.
- [ ] User can skip the first log and go directly to the main app.

### Implementation notes

- Reuse the existing conversational meal logging flow — this step should hand off into it seamlessly.
- Completion of the first meal log should be tracked as an activation event.

---

## CO-010: Onboarding resume

---
id: CO-010
status: ready
priority: P1
type: story
feature: conversational-onboarding
links:
  - ../features/conversational-onboarding.md
  - ../prds/conversational-onboarding.md
---

**As a** user who left onboarding before finishing
**I want** to pick up where I left off
**So that** I don't have to re-enter information I already provided.

### Acceptance criteria

- [ ] Onboarding state is saved automatically after each step is completed.
- [ ] Returning users are taken directly to their last incomplete step.
- [ ] All previously entered data is pre-filled / pre-selected.
- [ ] If a user has completed onboarding, they are never shown the onboarding flow again.

### Implementation notes

- Store onboarding progress (current step + collected data) in the user's profile or a dedicated onboarding state table in Supabase.
- Gate the "onboarding complete" flag on targets being saved (CO-007/CO-008 accepted).

### Test cases

- [ ] Closing the app mid-flow and reopening resumes at the correct step.
- [ ] Previously entered stats are shown, not blank.
- [ ] A user with completed onboarding goes directly to the main app on launch.
