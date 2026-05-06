<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Nomlog Expo app. Here's a summary of what was done:

- Installed `posthog-react-native` and created `src/config/posthog.ts` — PostHog client configured via `app.config.js` extras, reading `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` from `.env.development`
- Updated `app.config.js` to expose `posthogProjectToken` and `posthogHost` via `Constants.expoConfig.extra`
- Wrapped the app in `PostHogProvider` in `app/_layout.tsx` with autocapture for touches; added `ScreenTracker` for Expo Router screen tracking; added user identification/reset in `AuthInitializer` whenever auth state changes
- Added `posthog.identify()` + `user_signed_in` / `user_signed_up` captures in `AuthScreen`, plus exception capture on auth errors
- Captured `onboarding_completed` (with goal, activity level, and biological sex) in `OnboardingScreen`
- Captured `user_signed_out` + `posthog.reset()` in `SettingsScreen`
- Captured `meal_logged`, `meal_logging_failed`, `favorite_meal_saved`, `meal_analysis_received`, `activity_logged`, and `chat_message_sent` throughout `ChatScreen`
- Captured `favorite_meal_removed` in `FavoriteMealsScreen`
- Captured `water_tracked` in `WaterTracker`

## Events

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User successfully signed in | `src/screens/AuthScreen.tsx` |
| `user_signed_up` | User successfully created a new account | `src/screens/AuthScreen.tsx` |
| `user_signed_out` | User signed out from the app | `src/screens/SettingsScreen.tsx` |
| `onboarding_completed` | User finished the onboarding flow | `src/screens/OnboardingScreen.tsx` |
| `meal_logged` | User successfully logged a meal | `src/screens/ChatScreen.tsx` |
| `meal_logging_failed` | An error occurred when logging a meal | `src/screens/ChatScreen.tsx` |
| `activity_logged` | User successfully logged a workout/activity | `src/screens/ChatScreen.tsx` |
| `favorite_meal_saved` | User saved a meal to favorites | `src/screens/ChatScreen.tsx` |
| `favorite_meal_removed` | User removed a meal from favorites | `src/screens/FavoriteMealsScreen.tsx` |
| `chat_message_sent` | User sent a message in the chat logger | `src/screens/ChatScreen.tsx` |
| `meal_analysis_received` | AI returned a nutrition analysis | `src/screens/ChatScreen.tsx` |
| `water_tracked` | User updated their daily water intake | `src/components/WaterTracker.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard**: [Analytics basics](https://us.posthog.com/project/380842/dashboard/1463117)
- **Sign-ups & Daily Active Users**: [Insight](https://us.posthog.com/project/380842/insights/ErMUa5xz)
- **New User Activation Funnel** (sign-up → onboarding → first meal): [Insight](https://us.posthog.com/project/380842/insights/Fakh2DZp)
- **Meal & Activity Logging (Daily)**: [Insight](https://us.posthog.com/project/380842/insights/AEOOTAaQ)
- **Chat Messages by Mode**: [Insight](https://us.posthog.com/project/380842/insights/65XHyVSg)
- **Meal Log Success vs. Failures**: [Insight](https://us.posthog.com/project/380842/insights/YUtp7V4D)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
