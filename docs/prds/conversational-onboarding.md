# NomLog – Conversational Onboarding PRD (MVP)

## Overview

NomLog onboarding introduces users to the chat-first logging experience while collecting the minimum data required to generate personalized calorie and macro targets.

The experience should feel like a coach, not a form.

Onboarding must:
- Be conversational
- Deliver value quickly
- Take less than 3 minutes to complete
- Immediately lead into first meal logging

---

## Goals

1. Collect required inputs to calculate calorie + macro targets.
2. Deliver a personalized nutrition plan.
3. Teach users how to log meals via chat.
4. Maximize onboarding completion and first-meal activation.

---

## Success Metrics

- Onboarding completion rate
- Time to complete onboarding
- % of users who log a meal within 2 minutes of completing onboarding
- % of users who accept recommended targets vs adjust

---

## Target User

Health-conscious individuals who want a simple way to:
- Lose weight
- Gain muscle
- Maintain weight
- Recompose body composition

Users may or may not have prior macro tracking experience.

---

# User Stories & Requirements

---

## 1. Welcome & Setup Intro

**User Story**  
As a new user, I want to understand what NomLog does and why setup matters.

**Requirements**
- Friendly introduction message
- Clear explanation that setup personalizes nutrition goals
- Clear CTA to begin
- Conversational tone

---

## 2. Name Collection (Optional)

**User Story**  
As a user, I want NomLog to call me by my name.

**Requirements**
- Ask what the user wants to be called
- Optional input
- Name used later in conversation

---

## 3. Goal Selection

**User Story**  
As a user, I want to choose my primary goal.

**Requirements**
- Predefined goal options:
  - Lose weight
  - Gain muscle
  - Maintain weight
  - Recomposition
- Clear descriptions if needed
- Easy tap selection
- One primary goal selected

---

## 4. Physical Stats Collection

**User Story**  
As a user, I want to enter my physical stats so my plan is accurate.

**Required Inputs**
- Weight
- Height
- Age
- Biological sex

**Requirements**
- Asked one at a time
- Unit flexibility (imperial/metric)
- Gentle validation
- Supportive tone

---

## 5. Activity Level

**User Story**  
As a user, I want to describe how active I am.

**Requirements**
- Clearly described activity levels
- Easy selection
- Brief explanation of why this matters

---

## 6. Goal Speed (Conditional)

**User Story**  
As a user trying to lose or gain weight, I want to control how aggressive my plan is.

**Requirements**
- Only shown for lose/gain goals
- Options:
  - Conservative
  - Balanced
  - Aggressive
- Short explanation of tradeoffs
- Avoid extreme dieting language

---

## 7. Macro & Calorie Reveal

**User Story**  
As a user, I want to see my personalized targets.

**Requirements**
- Display:
  - Daily calories
  - Protein (g)
  - Carbs (g)
  - Fat (g)
- Visually scannable format
- Clear options:
  - Accept targets
  - Adjust targets
  - Learn how they were calculated
- Explanation builds trust but stays concise

---

## 8. Adjustment Flow (Optional)

**User Story**  
As a user, I want to tweak my targets if needed.

**Requirements**
- Manual macro adjustment available
- Updated totals shown clearly
- Prevent unrealistic macro configurations
- Option to return to recommended targets

---

## 9. Activation: First Meal Log

**User Story**  
As a new user, I want to try logging a meal immediately.

**Requirements**
- Prompt user to log first meal after accepting targets
- Provide example input
- Free-text logging supported
- Successful log reinforces daily progress

---

## 10. Resume Capability

**User Story**  
As a user who leaves mid-onboarding, I want to resume later.

**Requirements**
- Progress saved automatically
- Resume at last incomplete step
- Previously entered data persists

---

# Experience Principles

- Feels like coaching, not data entry
- Simple and fast
- No overwhelm
- Value delivered before account creation
- Supportive, non-judgmental tone

---

# Out of Scope (MVP)

- Micronutrient targeting
- Advanced macro periodization
- Wearable integrations
- Body fat % tracking
- Full nutrition education modules

---

# Future Considerations

- Dietary preferences (vegetarian, high-protein, etc.)
- Subscription upsell after value is demonstrated
- Goal revision flows
- Progress tracking visuals
- Behavioral coaching prompts

---

# Definition of Done

- User can complete onboarding in under 3 minutes
- User receives personalized calorie + macro targets
- User can log a meal immediately after
- Progress persists across sessions