---
feature: meal-logging
area: Meal Logging
source_doc: ../features/meal-logging.md
---

# Meal Logging Stories

## Backlog

## ML-001: Quick-add recent meals

---
id: ML-001
status: ready
priority: P1
type: story
feature: meal-logging
links:
  - ../FEATURES.md#notes-for-product-roadmap
---

**As a** returning user
**I want** to quickly re-log a meal I ate recently
**So that** I can keep my log up to date without retyping common meals.

### Acceptance criteria

- [ ] From the meal logging view, I can see a list of my recent meals (e.g. last 10).
- [ ] Tapping a recent meal pre-fills the logging flow with that meal’s description and analysis.
- [ ] I can adjust time and portions before saving.
- [ ] The new log is stored as a separate meal entry linked to the original only for audit/debug purposes.

### Implementation notes (optional)

- Recent meals can likely be sourced from the existing meal log query with a date/window limit.
- Consider reusing the conversational editing flow to tweak the pre-filled meal before saving.

### Test cases (optional)

- [ ] Selecting a recent meal creates a new log with the same ingredients but a new timestamp.
- [ ] Editing the pre-filled meal does not mutate the original meal log.

## ML-002: Save meal as favorite template

---
id: ML-002
status: ready
priority: P1
type: story
feature: meal-logging
links:
  - ../FEATURES.md#notes-for-product-roadmap
---

**As a** user with a few staple meals
**I want** to save a logged meal as a reusable template
**So that** I can log that meal with one or two taps in the future.

### Acceptance criteria

- [ ] From a meal detail or card, I can mark a meal as a favorite/template.
- [ ] Favorite meals appear in a dedicated “Favorites” section when starting a new log.
- [ ] Selecting a favorite pre-fills the logging flow with that meal’s description and analysis.
- [ ] I can rename or delete a favorite without affecting historical logs.

### Implementation notes (optional)

- Favorites can be implemented as references to existing meals with their own display name and metadata.
- Consider how favorites interact with the “Quick-add recent meals” experience to avoid redundancy/confusion.

### Test cases (optional)

- [ ] Marking a meal as favorite makes it show up in the Favorites list.
- [ ] Deleting a favorite does not delete any past meal logs.
- [ ] Editing a favorite template does not retroactively change past meal logs.

