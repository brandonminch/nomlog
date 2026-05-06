---
name: nomlog-web-ui
description: UI conventions for the nomlog-web Next.js app. Use when adding or changing pages, layouts, or components under nomlog-web—prefer shadcn/ui primitives from @/components/ui, extend with Tailwind and globals.css tokens, and apply distinctive frontend-design-level polish (typography, motion, cohesive theme) without generic stock UI patterns.
---

# nomlog-web UI

## Component stack

- **Primitives:** Use existing **shadcn/ui** components from `@/components/ui` (see `components.json` for style: base-nova, RSC, CSS variables in `src/app/globals.css`).
- **Icons:** `lucide-react` (matches shadcn setup).
- **Do not** hand-roll buttons, inputs, dialogs, dropdowns, etc. when a matching primitive exists or can be added.

## Adding new shadcn components

From the monorepo root:

```bash
pnpm --filter nomlog-web exec shadcn add <component>
```

Or from `nomlog-web/`:

```bash
pnpm exec shadcn add <component>
```

New files land under `src/components/ui/` unless the CLI targets another path; keep imports aligned with `@/components/ui/...`.

## Styling and layout

- Prefer **Tailwind** utilities and **CSS variables** from `globals.css` over ad-hoc hex values when tokens exist.
- Compose layouts with shadcn pieces first, then layer spacing, typography, and motion.
- For **new** screens or marketing-style surfaces, treat **frontend-design** as the aesthetic bar—bold intentional direction, memorable typography and motion—while still building on shadcn for behavior and accessibility baselines.

## Imports

- `@/components/...` maps to `src/` per `tsconfig.json`. Keep new feature components in `src/components/` (or colocate under `src/app/` when appropriate for Next.js), importing UI from `@/components/ui`.
