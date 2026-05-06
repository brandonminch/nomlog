# 0001: Use Supabase for authentication

**Status:** Accepted  
**Date:** (Set when you adopt this as a recorded decision.)

## Context

Nomlog needs user authentication and session management so each user only sees and modifies their own meal logs and settings. We needed a solution that works with the existing Supabase-backed database and fits a mobile (React Native/Expo) + API stack.

## Decision

Use **Supabase Auth** for authentication. The app signs users in directly with Supabase (email/password); JWTs are used for API and database access. Row Level Security (RLS) in Supabase ensures users can only access their own data. Deprecated or unused API auth endpoints were removed in favor of this flow.

## Consequences

- **Benefits:** Single provider for auth and database; built-in token refresh and session handling; RLS keeps data isolated without extra app logic.
- **Trade-offs:** Auth is coupled to Supabase; migrating auth later would require a coordinated change in app and any backend checks.
- **Remember:** Keep using RLS for all user-scoped tables; do not rely on app-only checks for sensitive data.
