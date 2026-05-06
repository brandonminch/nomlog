# Nomlog Admin (nomlog-web)

Next.js admin site for managing Nomlog content and internal tools. Uses the App Router, TypeScript, Tailwind CSS v4, and [shadcn/ui](https://ui.shadcn.com/).

## Requirements

- **Node.js** 20.19+ or 22.x (see `.nvmrc`). The monorepo uses **pnpm** from the repository root.
- Prefer upgrading Node to match `engines` in `package.json`.

## Setup

```bash
cd /path/to/Nomlog   # monorepo root
pnpm install
cd nomlog-web
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_SUPABASE_* to the same project as nomlog-app,
# and NEXT_PUBLIC_API_URL to your nomlog-api base URL when you call the API.
cd .. && pnpm --filter nomlog-web run dev
```

Open [http://localhost:3000](http://localhost:3000). The root path redirects to `/dashboard`.

## Authentication and access control

- Sign-in uses **Supabase Auth** (email + password), same project as the mobile app.
- After login, access is allowed only if your `auth.users` id appears in the **`admin_users`** table (see migration in `nomlog-api`). RLS lets each user read only their own row in that table; only the **service role** or the Supabase SQL editor can insert/delete admin rows.
- **`/dashboard`** and **`/api/admin/*`** are protected in [middleware](src/middleware.ts): no session → `/login`; session but not in `admin_users` → `/unauthorized`.
- The dashboard layout also calls **`assertAdmin()`** so routes stay locked down if matcher rules change.

### Grant the first admin (development)

After applying the `admin_users` migration to your Supabase project:

1. In the Supabase dashboard → **Authentication** → **Users**, copy the UUID of the account that should be admin.
2. Run in the SQL editor:

   ```sql
   INSERT INTO admin_users (user_id) VALUES ('paste-uuid-here');
   ```

Use your **development** branch/project until you intentionally change production.

## Scripts

| Command (from repo root) | Description                    |
|---------------------------|--------------------------------|
| `pnpm --filter nomlog-web run dev` | Development server             |
| `pnpm --filter nomlog-web run build` | Production build               |
| `pnpm --filter nomlog-web run start` | Start production server (uses `PORT`, default 3000) |
| `pnpm --filter nomlog-web run lint` | ESLint                         |

## Deployment on Render

Create a **Web Service** from this **monorepo** (repository root as the Render root directory).

1. **Build command:** `pnpm install && pnpm --filter nomlog-web run build`
2. **Start command:** `pnpm --filter nomlog-web run start`
3. **Environment**
   - `NODE_ENV` — set to `production` (Render often sets this automatically).
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same values as **nomlog-app** / your Supabase project (needed for auth).
   - `NEXT_PUBLIC_API_URL` — public base URL of your deployed **nomlog-api** when the admin UI calls it (no trailing slash).

The start script binds to `0.0.0.0` and uses the `PORT` variable Render provides.

If Render’s Node version does not match, set **Environment** → `NODE_VERSION` to `22` (or the version in `.nvmrc`) to align with local builds.

## Project layout

- `src/app/(dashboard)/` — route group for the admin shell (sidebar + header).
- `src/app/(dashboard)/dashboard/` — URLs under `/dashboard`, `/dashboard/recipes`, `/dashboard/content`, `/dashboard/users`.
- `src/app/(auth)/login/` — sign-in at `/login`; `unauthorized/` — not in `admin_users`.
- `src/lib/supabase/` — browser + server + middleware Supabase clients; `src/lib/auth/` — admin checks.
- `src/components/ui/` — shadcn components.
- `src/components/admin/` — app-specific shell (sidebar, dashboard layout).

`buttonVariants` lives in `src/lib/button-variants.ts` so server components can style links without importing client-only UI modules.
