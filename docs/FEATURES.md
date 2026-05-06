# Nomlog - Current Features Overview

## Product Manager's Feature Inventory

This document is the index for the feature inventory. Each area is documented in its own file under [features/](features/) so you can edit and link to them modularly. Use this to inform product roadmap decisions, identify gaps, and prioritize launch features.

---

## Feature areas

| # | Area | Doc |
|---|------|-----|
| 1 | User Authentication & Account Management | [features/authentication.md](features/authentication.md) |
| 2 | Meal Logging | [features/meal-logging.md](features/meal-logging.md) |
| 2b | Activity logging | [features/activity-logging.md](features/activity-logging.md) |
| 3 | Meal Planning | [features/meal-planning.md](features/meal-planning.md) |
| 4 | Nutrition Analysis & Tracking | [features/nutrition-tracking.md](features/nutrition-tracking.md) |
| 5 | Water Tracking | [features/water-tracking.md](features/water-tracking.md) |
| 6 | Search & Discovery | [features/search-discovery.md](features/search-discovery.md) |
| 7 | Push Notifications & Reminders | [features/push-notifications-reminders.md](features/push-notifications-reminders.md) |
| 8 | User Settings & Preferences | [features/user-settings-preferences.md](features/user-settings-preferences.md) |
| 9 | Data Management & Reliability | [features/data-management-reliability.md](features/data-management-reliability.md) |
| 10 | User Interface & Experience | [features/user-interface-experience.md](features/user-interface-experience.md) |
| 11 | Technical Infrastructure | [features/technical-infrastructure.md](features/technical-infrastructure.md) |
| 12 | Conversational Onboarding | [features/conversational-onboarding.md](features/conversational-onboarding.md) |

---

## Feature Completeness Matrix

### Fully Implemented ✅
- User authentication
- Conversational onboarding (chat-first; collects goals, stats, activity level; resume capability)
- Meal logging (conversational)
- Edit meal: **Edit in chat** (time, name, description, ingredients; unsaved-change prompt on close) and **Edit manually** inline form (name, description, photos, totals without re-analysis)
- Nutrition analysis
- Daily nutrition tracking
- Weekly statistics
- Water tracking
- Meal search (semantic)
- Push notifications
- User settings (profile, date of birth, optional nutrition-target refresh prompt, editable daily goals)
- Real-time sync
- Error handling/retry
- Planned meals (pre-logged; counts only when logged)
- Meal planning via chat (single-meal suggestions, weekly plans, in-chat review/replace, recipe detail view, planned meal integration, recipe URL import)
- Favorite meal templates (chat Favorites tab; Profile → Favorite meals list and detail; create/edit template-only via chat without creating a log; log from template when desired; remove template via favorites API)

### Partially Implemented ⚠️
- Weight tracking (data model exists, UI may be limited)
- Activity logging (conversational chat + HealthKit Recent tab + optional automatic HealthKit sync from Settings; structured manual workout schemas with minimum required fields for burn estimation; optional effort rating; profile-based async burn estimate; logs + day/item detail screens + API incl. delete; burned calories not yet tied to intake goals)
- Photo recognition (meal photo logging in chat via camera/library + AI summary is available; scan/barcode is still pending)

### Not Implemented ❌
- Shopping lists and pantry-aware meal planning
- Food database browsing
- Social features
- Export/import data
- Barcode scanning
- Meal templates (beyond favorites)
- Nutrition insights/trends beyond weekly stats
- Deeper integration with fitness trackers (beyond Apple Health workout import and optional auto-sync on iOS)
- Meal sharing
- Recipe creation/management (users can import via URL; full CRUD not yet exposed)

---

## Notes for Product Roadmap

1. **Core MVP Features**: The app has a solid foundation with conversational logging, nutrition tracking, and basic analytics.

2. **Gaps to Consider for Launch**:
   - Settings UI for goals/weight may need completion
   - Error states and edge cases may need polish
   - Onboarding flow for new users
   - Help/documentation

3. **Potential Quick Wins**:
   - Meal favorites/templates
   - Quick-add from recent meals
   - Better nutrition insights

4. **Future Considerations**:
   - Recipe support
   - Barcode scanning
   - Photo recognition
   - Social features
   - Export capabilities
