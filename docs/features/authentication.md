# User Authentication & Account Management

[← Feature index](../FEATURES.md)

## Core Features

- **Email/Password Authentication** (via Supabase Auth)
  - Sign up with email and password
  - Sign in with email and password
  - Token refresh and session management
  - Secure authentication with JWT tokens
- **Social Authentication** (via Supabase Auth)
  - Sign in with Google (iOS, Android, Web)
  - Sign in with Apple (iOS only)
- **User Profile Management**
  - View user profile (email display)
  - Sign out functionality
  - Profile auto-creation on first login
- **Nomlog admin web (`nomlog-web`)**
  - Same Supabase project: email/password sign-in via `@supabase/ssr` (cookie session)
  - Extra gate: user must have a row in **`admin_users`** (`user_id` → `auth.users.id`) to use `/dashboard` (enforced in Next.js middleware and server `assertAdmin()`)
  - Non-admins with a valid session are sent to `/unauthorized`; granting or revoking admin is done with the **service role** or Supabase SQL, not by end users

## Technical Notes

- Deprecated API endpoints for auth (app uses Supabase Auth directly)
- Row Level Security (RLS) ensures users can only access their own data
- **`admin_users`**: RLS allows `authenticated` **SELECT** only where `auth.uid() = user_id`; no `INSERT`/`UPDATE`/`DELETE` policies for `authenticated` (managed out-of-band)

## Supabase Provider Setup (Development)

Configure providers in the Supabase dashboard (development branch): Authentication → Providers.

- **Google**
  - Enable Google provider and create OAuth client IDs for iOS/Android (and Web if using web).
  - Ensure the client IDs used by the app are present in your environment for `nomlog-app`.
- **Apple**
  - Enable Apple provider and configure the Services ID / key / team association as required by Supabase.
  - Apple sign-in is only available on iOS in the app.

### Redirect / deep link URIs

The app uses the custom scheme `nomlog` (see `nomlog-app/app.json`). The social sign-in flow uses:

- `nomlog://auth/callback`
