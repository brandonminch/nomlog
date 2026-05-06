# Nomlog API

A TypeScript Express API for analyzing meal logs using LangChain and OpenAI.

## Setup

1. Clone the repository
2. From the **monorepo root**, install dependencies:
   ```
   pnpm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3001
   NODE_ENV=development
   API_VERSION=v1
   OPENAI_API_KEY=your-openai-api-key-here
   OPENAI_MODEL_NAME=gpt-3.5-turbo
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_ANON_KEY=your-anon-key
   DATABASE_URL=your-postgres-connection-string
   ```

   **Production vs develop (Supabase branching):** copy `.env.development.example` → `.env.development` and/or `.env.production.example` → `.env.production`, then from the repo root run `pnpm --filter nomlog-api run dev:develop` or `pnpm --filter nomlog-api run dev:production` instead of `dev`. See [docs/deployment/supabase-environments.md](../docs/deployment/supabase-environments.md).
   
   **Note for DATABASE_URL**: For Supabase, find this in:
   - Project Settings > Database > Connection string
   - Use either "Connection pooling" (port 6543) or "Direct connection" (port 5432)
   - Format: `postgresql://postgres.[project-ref]:[password]@[host]:[port]/postgres`
4. Build the project (from repo root):
   ```
   pnpm --filter nomlog-api run build
   ```
5. Start the development server (from repo root):
   ```
   pnpm --filter nomlog-api run dev
   ```

## Database Migrations

This project uses the **Supabase CLI** for database migrations. Migrations are stored in `supabase/migrations/` and follow the naming pattern `<timestamp>_<name>.sql`.

### Setup

1. Install Supabase CLI (if not already installed):
   ```bash
   brew install supabase/tap/supabase
   # or
   npm install -g supabase
   ```

2. Link your project to Supabase:
   ```bash
   cd nomlog-api
   supabase link --project-ref <your-project-ref>
   ```
   Find your project ref in: Supabase Dashboard > Project Settings > General > Reference ID

### Running Migrations

**Apply migrations to remote database:**
```bash
supabase db push
```

**Reset local database (if using local development):**
```bash
supabase db reset
```

**Create a new migration:**
```bash
supabase migration new <migration_name>
```

**Check migration status:**
```bash
supabase migration list
```

### Migration Files

Migrations are stored in `supabase/migrations/` and executed in timestamp order:
- `20240101000000_initial_schema.sql` - Base schema (meal_logs, user_profiles, etc.)
- `20240201000000_add_logged_at.sql` - Adds logged_at column
- `20240301000000_add_goals_and_weight.sql` - Adds goals and weight columns

### Environment-Specific Migrations

The Supabase CLI uses the linked project in `supabase/.temp/` (gitignored). To switch environments:

```bash
# Link to different project / branch ref
supabase link --project-ref <production-project-ref>

# Or use named remotes (CLI)
supabase link --project-ref <dev-project-ref> --name dev
supabase link --project-ref <prod-project-ref> --name prod
```

With **Supabase Database Branching** and the GitHub integration, migrations under `nomlog-api/supabase/migrations/` are applied to preview branches on PRs and to production when you merge to the configured production branch. See [docs/deployment/supabase-environments.md](../docs/deployment/supabase-environments.md).

## API Endpoints

### Logs

- `GET /api/v1/logs` - Get all logs
- `POST /api/v1/logs` - Create a new log with nutrition analysis
  - Request body:
    ```json
    {
      "mealDescription": "I had a breakfast with 2 eggs, 2 slices of whole wheat toast with butter, and a cup of coffee with milk"
    }
    ```
  - Response:
    ```json
    {
      "message": "Meal log created with nutrition analysis",
      "data": {
        "name": "Breakfast",
        "totalNutrition": {
          "calories": 450,
          "fat": 22,
          "protein": 20,
          "carbohydrates": 45
        },
        "ingredients": [
          {
            "name": "Eggs",
            "amount": "2 eggs",
            "nutrition": {
              "calories": 140,
              "fat": 10,
              "protein": 12,
              "carbohydrates": 0
            }
          },
          // More ingredients...
        ]
      }
    }
    ```

### Users

- `GET /api/v1/users` - Get all users
- `GET /api/v1/users/:id` - Get a user by ID

## Deployment

For deployment on Render:

1. Add the following environment variables in the Render dashboard:
   - `PORT`
   - `NODE_ENV=production`
   - `API_VERSION=v1`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL_NAME`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `ONESIGNAL_APP_ID`
   - `ONESIGNAL_API_KEY`
   - `REMINDER_WINDOW_MINUTES` (optional, default 7)

   For a **staging** API service, duplicate the service and set `SUPABASE_*` to your develop Supabase branch credentials (dashboard → branch → Settings → API).

2. Set the build command to: `pnpm install && pnpm --filter nomlog-api run build` (repository root as Render root directory)
3. Set the start command to: `pnpm --filter nomlog-api run start`

### Reminder Cron Job (Render)

Create a Render Cron Job to send push reminder notifications at user-local breakfast, lunch, and dinner times.

- Schedule: `*/5 * * * *` (every 5 minutes, UTC)
- Command: `pnpm --filter nomlog-api run job:send-reminders`
- Service: point to this repo with the same environment variables as the API

The job checks each user's `user_profiles` row for `timezone` and local times (`breakfast_time`, `lunch_time`, `dinner_time`). When current local time is within `REMINDER_WINDOW_MINUTES` of a meal time and no send exists in `reminder_sends` for that date/meal, it sends a OneSignal notification targeting the user's `external_id` (set to Supabase `auth.users.id` in the app) and records the send.

Schema additions are in `supabase/schema.sql` (`user_profiles`, `reminder_sends`).
