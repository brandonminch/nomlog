# Push Notifications & Reminders

[← Feature index](../FEATURES.md)

## Core Features

- **Meal Reminders**
  - Customizable meal reminder times (breakfast, lunch, dinner)
  - Timezone-aware reminder scheduling
  - Push notification delivery via OneSignal
  - Reminder window (default 7 minutes)
  - One reminder per meal per day (deduplication)
  - Skips default reminders if the meal was already logged for that meal slot (e.g. breakfast logged earlier today)
  - Random reminder messages for variety
  - **Planned meal reminders**: If the user has a planned meal with a specific planned time, a reminder is sent near that planned time; default meal-time reminders are suppressed for that meal slot when a planned meal exists.

- **Notification Preferences**
  - Enable/disable push notifications
  - Per-user notification settings

## Technical Notes

- Cron job runs every 5 minutes
- Checks user timezone and local meal times
- Tracks sent reminders to prevent duplicates
