# NomLog - Meal Planning Chat PRD (MVP)

## Overview

Meal Planning Chat adds a planning-focused mode to NomLog's existing chat experience.

Instead of only helping users log what they already ate, this mode helps them decide what to eat next and build a lightweight plan for upcoming meals. The experience should still feel conversational, fast, and personalized, but it should optimize for recommendation, review, and adjustment rather than logging.

The MVP should support two core jobs:
- Help a user choose a single meal for a specific meal occasion.
- Help a user generate and refine a meal plan for up to 1 week.

---

## Goals

1. Help users answer "what should I eat?" with personalized meal suggestions.
2. Use each user's calorie, macro, and activity context to make planning responses feel relevant.
3. Let users turn a suggested meal into a planned meal for a specific day and meal time.
4. Let users generate, review, and refine a weekly meal plan directly in chat.
5. Introduce recipe viewing as a natural next step from a suggested or planned meal.

---

## Success Metrics

- % of chat sessions that enter meal planning mode
- % of meal planning chats that result in at least 1 planned meal
- % of weekly meal plans where the user accepts at least 1 suggested meal
- Average number of replace / swap actions before plan acceptance
- Recipe detail view open rate from a meal card

---

## Target User

Users who already have or are willing to set nutrition goals, and want help deciding meals without manually planning everything themselves.

Common users include:
- Someone asking what to eat for dinner tonight
- Someone who wants easy, high-protein lunch ideas
- Someone who wants a simple 3-7 day meal plan aligned to their goals
- Someone who wants structure without a heavy meal-planning workflow

---

## User Jobs

- "What should I have for dinner tonight?"
- "Help me plan my meals for the week."
- "What can I have for lunch that's high in protein and easy to prepare?"
- "Give me another option."
- "Swap Tuesday lunch."
- "Show me the recipe."

---

## MVP Scope

### In scope

- A planning-oriented chat mode that the user can switch into from the current chat experience
- Personalized meal suggestions based on profile nutrition goals and activity context
- Single-meal suggestions with a clear action to save one as a planned meal
- Weekly meal planning for up to 7 days maximum
- In-chat review and refinement of a meal plan
- Lightweight meal cards and list views to make plans easy to scan
- Recipe detail view reachable from a meal card

### Out of scope for MVP

- Shopping list generation
- Multi-person or family serving workflows
- Scaling recipe servings while logging a different personal portion
- Taste profile collection beyond lightweight conversational signals
- Fasting-aware meal planning logic
- Budgeting single-meal suggestions against the user's already logged meals for that day
- Full pantry, grocery, or inventory-aware planning

---

## Core Product Requirements

## 1. Enter Meal Planning Mode

**User Story**  
As a user, I want to switch chat from logging mode into planning mode so I can ask what I should eat instead of logging what I already ate.

**Requirements**
- Chat exposes a clear way to switch from the current meal logging experience into meal planning mode.
- Planning mode has distinct copy and empty states so users understand they are planning, not logging.
- Users can switch back to logging without losing their current context unnecessarily.
- The mode model should support both single-meal planning and weekly planning within the same planning experience.

---

## 2. Support Natural Meal Planning Prompts

**User Story**  
As a user, I want to ask for meal ideas in natural language so I can plan meals without learning a specific command format.

**Requirements**
- Planning mode understands common prompts for a single meal, a specific meal type, or a weekly plan.
- Users can specify constraints such as meal type, ease of prep, or high-protein preference in free text.
- The system can infer missing context when reasonable, then ask a lightweight follow-up only when needed.
- Responses should prioritize a few good options instead of overwhelming the user with a large list.

---

## 3. Personalize Suggestions Using Profile Goals

**User Story**  
As a user, I want meal suggestions to reflect my nutrition goals so the recommendations feel useful and tailored to me.

**Requirements**
- Planning responses use the user's profile goals, including calories, macros, and activity level, when available.
- Suggestions should explain why they fit in simple language when helpful, such as "high protein" or "lighter dinner option."
- Personalization should influence ranking and framing, not force false precision.
- If profile goals are incomplete, the planner should gracefully fall back by prompting the user to complete setup or by giving lower-confidence generic suggestions with clear messaging.

---

## 4. Suggest a Single Meal and Let the User Choose

**User Story**  
As a user, I want a few meal options for one meal occasion so I can quickly choose something that fits my needs.

**Requirements**
- For single-meal asks, the assistant returns a small set of options, ideally 2-4.
- Each option includes a meal name, short description, rough nutrition framing, and why it may be a fit.
- Each option can be selected, dismissed, or replaced through chat and lightweight UI.
- The response should support common asks like dinner tonight, lunch tomorrow, or a meal tied to a specific goal such as high protein and easy prep.

---

## 5. Create Planned Meals From Suggestions

**User Story**  
As a user, I want to turn a suggested meal into a planned meal for a specific day and meal time so my plan becomes actionable.

**Requirements**
- A suggested meal can be saved as a planned meal for a chosen day and meal slot.
- For one-off planning, users can confirm or adjust the target day and meal time before saving.
- Planned meals should align with NomLog's existing planned meal concepts where possible.
- Saving a planned meal should feel lightweight and should not force the user through the full meal logging flow.

---

## 6. Generate a Weekly Meal Plan

**User Story**  
As a user, I want help planning meals for the next several days so I can reduce decision fatigue and stay aligned to my goals.

**Requirements**
- The MVP supports meal plans up to 7 days maximum.
- Users can request a full week or a smaller planning window within that limit.
- The system should return a structured plan that is easy to review by day and meal time.
- The weekly plan should balance variety and consistency without trying to solve every future personalization problem in MVP.
- The planner should avoid generating an unusably large result in a single response.

---

## 7. Review, Replace, and Swap Meals

**User Story**  
As a user, I want to refine a generated plan by replacing or swapping meals I do not like so I can shape the plan without starting over.

**Requirements**
- Users can discard a suggested meal, ask for another option, or swap a meal within the plan directly through chat.
- Review UI should make it easy to understand which meal is being changed.
- Replacements should preserve surrounding context where possible, such as day, meal type, and broad nutrition intent.
- The flow should support repeated refinement without regenerating the entire plan unless the user asks for it.

---

## 8. Show Lightweight Review UI

**User Story**  
As a user, I want a simple visual review of meal options and plans so I can scan and edit them quickly.

**Requirements**
- Planning mode uses lightly styled meal cards and simple list views rather than dense forms.
- Cards should surface the key decision data only: name, meal type, timing, short nutrition summary, and primary actions.
- Weekly plans should be easy to scan by day and meal slot on a mobile screen.
- UI should remain lightweight enough to preserve the chat-first feel.

---

## 9. Add Recipe Detail View

**User Story**  
As a user, I want to view recipe details for a suggested or planned meal so I can understand how to make it before I commit.

**Requirements**
- Meal cards include a clear action to view the recipe.
- Recipe detail is presented in its own view rather than expanding excessively inside chat.
- Recipe detail should include at minimum ingredients, high-level steps, and serving context for the planned meal.
- Users can return to the planner flow without losing their place.

---

## 10. Handle MVP Guardrails and Fallbacks

**User Story**  
As a user, I want the planner to behave clearly when my context is incomplete so I know what it can and cannot personalize yet.

**Requirements**
- If a user lacks sufficient nutrition profile data, the planner explains the limitation clearly.
- If the user asks for more than 7 days, the planner politely limits the request to 1 week.
- The planner should avoid pretending to know strong taste preferences before enough feedback exists.
- Nutrition framing should be directional and helpful, not misleadingly exact when underlying data is approximate.

---

## Experience Principles

- Feels like a coach, not a rigid meal-planning wizard
- Personalized enough to be useful, but simple enough to stay fast
- Recommendation first, then lightweight review and adjustment
- Clear distinction between planning a meal and logging a meal
- Minimal UI that supports chat instead of replacing it

---

## Data and System Considerations

- Existing planned meal support is a strong anchor for MVP. The planner should reuse current planned meal concepts where possible instead of introducing a separate schedule model immediately.
- Existing user profile nutrition goals provide the baseline personalization inputs for the first version of recommendations.
- Current chat architecture is optimized for meal logging, so meal planning likely needs distinct prompt contracts, response structures, and UI state even if it shares some screen-level components.
- Recipe support will likely require a clearer meal-to-recipe relationship than the current logging flow, where "recipe" is only a provenance label on ingredient analysis.

---

## Future Considerations

- Allow changing recipe servings for family cooking while preserving a single logged portion for the user
- Generate a shopping list from a saved meal plan
- Use recent intake and past planner interactions to infer taste profile
- Ask first-time meal planner users about foods they love, dislike, or avoid
- Learn from discarded meals, swap requests, and "show me something else" interactions
- Support fasting-aware planning by considering meals the user usually skips
- For single meals, consider currently planned and already logged meals to better fit the remaining daily budget

---

## Open Questions / Assumptions

- Assumption: meal planning mode should be distinct from the current logging experience, even if both live within the same chat surface.
- Assumption: MVP recommendations can rely on profile goals plus lightweight user prompt constraints without a formal taste profile system.
- Open question: should meal planning be modeled as a third chat logger, a segmented chat mode, or a separate planner entry point that still feels like chat?
- Open question: should recipe content be generated, curated from structured meal data, or stored as a first-class recipe entity?
- Open question: should weekly plan generation target all meal slots by default, or only the meal slots the user explicitly requests?

---

## Definition of Done

- User can enter a planning-focused chat mode and ask for meal suggestions in natural language.
- User receives personalized options for a single meal and can save one as a planned meal.
- User can generate and refine a meal plan covering up to 1 week.
- User can replace or swap meals inside the plan without restarting.
- User can open a recipe detail view from a meal card.
