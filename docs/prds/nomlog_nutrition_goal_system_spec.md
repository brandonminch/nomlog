# Nomlog Nutrition Goal System Spec

## Purpose

This document defines the initial implementation for calculating a
user's calorie and macro targets in Nomlog.

The system should:

1.  Use a **standard starting estimate** during onboarding
2.  Store enough data to support a future **adaptive TDEE model**
3.  Make the logic easy to explain to users and easy to evolve later

This version is intended to be implemented now.

A future version should replace or supplement the static activity-based
estimate with an adaptive system that learns from logged intake and
weight trends over time.

------------------------------------------------------------------------

## Product Goals

The onboarding system should generate a reasonable starting target for
users who want to:

-   lose weight
-   maintain weight
-   build muscle
-   track intake
-   train for an event

The system should be:

-   simple enough for v1
-   scientifically reasonable
-   transparent and explainable
-   structured so that we can layer in adaptive updates later without
    reworking everything

------------------------------------------------------------------------

## Inputs Required at Onboarding

``` ts
age: number
heightCm: number
weightKg: number
biologicalSex: 'male' | 'female'
activityLevel:
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active'
goal:
  | 'lose_weight'
  | 'maintain_weight'
  | 'build_muscle'
  | 'track_intake'
  | 'training_event'
```

------------------------------------------------------------------------

## Activity Levels

  -------------------------------------------------------------------------
  id                  label             description       multiplier
  ------------------- ----------------- ----------------- -----------------
  sedentary           Sedentary         Little to no      1.2
                                        exercise. Most of 
                                        the day is spent  
                                        sitting.          

  lightly_active      Lightly active    Light exercise    1.375
                                        1--2 days per     
                                        week or generally 
                                        low movement.     

  moderately_active   Moderately active Exercise or       1.55
                                        sports about 3--4 
                                        days per week.    

  very_active         Very active       Hard exercise     1.725
                                        most days or a    
                                        physically active 
                                        lifestyle.        

  extremely_active    Extremely active  Intense daily     1.9
                                        training,         
                                        endurance prep,   
                                        or a highly       
                                        physical job.     
  -------------------------------------------------------------------------

------------------------------------------------------------------------

## Step 1: Calculate BMR

Use the **Mifflin‑St Jeor equation**.

### Male

``` ts
bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
```

### Female

``` ts
bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
```

------------------------------------------------------------------------

## Step 2: Calculate TDEE

``` ts
tdee = bmr * activityMultiplier
```

``` ts
const activityMultipliers = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
}
```

------------------------------------------------------------------------

## Step 3: Goal Calorie Adjustments

  goal              strategy         rule
  ----------------- ---------------- --------------
  lose_weight       deficit          tdee \* 0.8
  maintain_weight   maintenance      tdee
  build_muscle      surplus          tdee \* 1.1
  track_intake      informational    tdee
  training_event    slight surplus   tdee \* 1.05

------------------------------------------------------------------------

## Macro Strategy

1.  Set **protein first**
2.  Set **fat second**
3.  Fill remaining calories with **carbohydrates**

Energy per gram:

    Protein = 4 kcal/g
    Carbs = 4 kcal/g
    Fat = 9 kcal/g

------------------------------------------------------------------------

## Protein Targets

  goal              protein
  ----------------- ----------
  lose_weight       2.0 g/kg
  maintain_weight   1.6 g/kg
  build_muscle      2.2 g/kg
  track_intake      1.6 g/kg
  training_event    1.8 g/kg

------------------------------------------------------------------------

## Fat Targets

    fatCalories = targetCalories * 0.25
    fatGrams = fatCalories / 9

------------------------------------------------------------------------

## Carbohydrate Targets

    remainingCalories = targetCalories - proteinCalories - fatCalories
    carbGrams = remainingCalories / 4

------------------------------------------------------------------------

## Guardrails

Minimum calories:

    male: 1500
    female: 1200

Prevent negative carbs and clamp values if necessary.

------------------------------------------------------------------------

## Future Adaptive System

Later versions should estimate TDEE from logged intake and weight
change.

Concept:

    1 kg weight change ≈ 7700 kcal

    energyChange = weightChangeKg * 7700
    trueTdee = ((avgDailyCalories * days) + energyChange) / days

Smooth updates:

    updatedTdee = (previousTdee * 0.7) + (observedTdee * 0.3)

This allows Nomlog to learn the user's metabolism over time.

------------------------------------------------------------------------

## Implementation Summary

Cursor should build:

-   onboarding inputs
-   calorie + macro calculation module
-   activity multiplier system
-   macro allocation system
-   guardrails
-   storage fields that support future adaptive updates
-   an internal separation between **TDEE estimation** (static and future adaptive) and **goal + macro allocation**
-   an API + data model that can return both **current targets** and **suggested adaptive targets** for user approval

The architecture should allow the adaptive TDEE algorithm to be added
later without rewriting the macro system or the onboarding flow.
