# Data Management & Reliability

[← Feature index](../FEATURES.md)

## Core Features

- **Real-time Sync**
  - Real-time meal log updates via Supabase Realtime
  - Automatic UI refresh on data changes
  - Optimistic updates for better UX

- **Error Handling & Retry**
  - Failed analysis retry mechanism
  - Automatic retry for failed nutrition analyses (up to 3 attempts)
  - Analysis status tracking
  - Error state handling in UI

- **Data Persistence**
  - Offline token storage (AsyncStorage)
  - Automatic token refresh
  - Reliable data sync on app resume
