# Technical Infrastructure

[← Feature index](../FEATURES.md)

## Core Features

- **Backend API**
  - RESTful API (Express.js)
  - TypeScript implementation
  - Authentication middleware
  - Error handling and validation
  - Swagger documentation

- **Database**
  - Supabase (PostgreSQL)
  - Row Level Security (RLS)
  - Vector search capabilities
  - Real-time subscriptions
  - Database migrations ([branching and environments](../deployment/supabase-environments.md))

- **AI Integration**
  - OpenAI GPT integration for nutrition analysis
  - Web search for brand identification
  - Vector embeddings for semantic search
  - Configurable reasoning effort levels

- **Third-Party Services**
  - OneSignal for push notifications
  - Supabase for auth, database, and storage

- **Mobile iOS CI**
  - Xcode Cloud can archive `nomlog-app/ios/nomlog.xcworkspace` on push to `main` and distribute to TestFlight; setup and env vars are documented in [Xcode Cloud iOS deployment](../deployment/xcode-cloud-ios.md)

- **Admin web (`nomlog-web`)**
  - Next.js admin UI (Supabase Auth + `admin_users` allowlist)
  - Recipes: list and edit `recipes` rows in Supabase; preview mirrors in-app recipe detail styling; JSON fields edited as formatted JSON; saves use RLS policy allowing `UPDATE` only for users in `admin_users`
