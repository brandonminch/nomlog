# User Settings & Preferences

[← Feature index](../FEATURES.md)

## Core Features

- **Profile Settings**
  - Timezone configuration
  - Meal reminder times (breakfast, lunch, dinner)
  - Push notification toggle
  - Daily nutrition goals (calories, protein, carbs, fat) — summary on Profile with **tap to edit** on a dedicated screen
  - **Date of birth** (calendar date); age shown elsewhere is derived from DOB and timezone
  - Primary goal, biological sex, activity level, height, and weight — changing any input that affects TDEE/macros prompts whether to **keep current daily goals** or **update goals** to match the new profile
  - Weight tracking (pounds)
  - Membership usage card in Profile with daily token usage progress (`used / limit`) and remaining tokens for the current day
  - **Favorite meals**: From Profile, a **Meals** section links to the alphabetical list of saved favorite meal templates (`/favorite-meals`) for browse, detail, edit-in-chat, and unfavorite.

## Technical Notes

- Settings stored in `user_profiles` table
- Default values provided for new users
- Membership tiers are backend-managed via `memberships` + `user_memberships`; users default to the **free** tier
- Usage widget reads `GET /api/v1/users/profile/llm-usage` and displays daily token usage relative to the membership limit
