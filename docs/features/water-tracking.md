# Water Tracking

[← Feature index](../FEATURES.md)

## Core Features

- **Water Intake Logging**
  - Track daily water intake (glasses)
  - Date-specific water logs
  - Create or update water logs for any date
  - Visual water tracker component

## Technical Notes

- Separate `water_logs` table
- One log per user per date (upsert behavior)
