# Conversational Onboarding

[← Feature index](../FEATURES.md)

## Overview

A chat-first onboarding flow that collects the minimum data needed to generate personalized calorie and macro targets. The experience feels like a coach, not a form — completing in under 3 minutes and ending with the user's first meal log.

## Core Features

- **Welcome intro** — Friendly explanation of why setup matters with a clear CTA to begin
- **Name collection** — Optional; used throughout the conversation to personalize tone
- **Goal selection** — Single-choice from: Lose weight, Maintain weight, Build muscle, Track my intake, Training for an event
- **Physical stats** — Weight, height, **date of birth** (age is derived), biological sex; asked one at a time; imperial/metric support for height and weight
- **Activity level** — Clearly described levels with a brief explanation of why it affects targets
- **Goal speed** (conditional) — Conservative / Balanced / Aggressive pacing; shown only for lose/gain goals
- **Macro & calorie reveal** — Personalized daily targets (calories, protein, carbs, fat) with accept/adjust/explain options
- **Target adjustment** — Manual tweak flow with validation to prevent unrealistic configurations
- **First meal activation** — Guided prompt to log a first meal immediately after accepting targets
- **Resume capability** — Progress auto-saved; user resumes at last incomplete step

## Success Metrics

- Onboarding completion rate
- Time to complete (target < 3 min)
- % of users who log a meal within 2 min of completing onboarding
- % of users who accept recommended targets vs. adjust

## Technical Notes

- Onboarding state must persist across sessions (resume capability)
- Calorie/macro calculation uses standard formulas (e.g. Mifflin-St Jeor + activity multiplier)
- Validation should prevent physiologically unrealistic macro splits
- Out of scope for MVP: micronutrient targeting, body fat %, wearable integrations

## Source

PRD: [../prds/conversational-onboarding.md](../prds/conversational-onboarding.md)
