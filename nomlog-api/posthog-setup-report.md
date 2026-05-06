<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Nomlog API. A shared PostHog client module was created at `src/config/posthog.ts`, and 13 business-critical events were instrumented across 7 route files. User identification is performed on signup and login. Exception capture is added to all error handlers so unhandled server errors are tracked in PostHog Error Tracking.

| Event name | Description | File |
|---|---|---|
| `user signed up` | User created a new account via the signup endpoint | `src/routes/auth.ts` |
| `user logged in` | User authenticated via the login endpoint | `src/routes/auth.ts` |
| `meal log created` | User logged a new meal entry | `src/routes/logs.ts` |
| `meal log updated` | User edited an existing meal log | `src/routes/logs.ts` |
| `meal log deleted` | User deleted a meal log | `src/routes/logs.ts` |
| `meal chat summary requested` | User triggered an async AI meal chat summary | `src/routes/logs.ts` |
| `meal photo uploaded` | User uploaded a meal photo to storage | `src/routes/mealPhotos.ts` |
| `activity log created` | User logged a new activity/workout | `src/routes/activityLogs.ts` |
| `activity log updated` | User edited an existing activity log | `src/routes/activityLogs.ts` |
| `activity log deleted` | User deleted an activity log | `src/routes/activityLogs.ts` |
| `user profile updated` | User updated their profile (goals, stats, preferences) | `src/routes/users.ts` |
| `water log updated` | User updated their daily water intake | `src/routes/water.ts` |
| `recipe interaction recorded` | User interacted with a recipe (saved, cooked, rated, skipped) | `src/routes/recipes.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard** — [Analytics basics](https://us.posthog.com/project/380842/dashboard/1475857)
- **Insight** — [New signups over time](https://us.posthog.com/project/380842/insights/Lya4yHuS)
- **Insight** — [Signup to first meal log funnel](https://us.posthog.com/project/380842/insights/dk1WLgjK)
- **Insight** — [Daily logging activity](https://us.posthog.com/project/380842/insights/m4ovasb5)
- **Insight** — [Recipe interaction breakdown](https://us.posthog.com/project/380842/insights/m6XsiYar)
- **Insight** — [User profile completion funnel](https://us.posthog.com/project/380842/insights/tQN0kkfB)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
