# Monorepo design — Nomlog (pnpm + Turborepo)

**Date:** 2026-05-06  
**Status:** Draft for implementation planning  
**Environment assumption:** Development-first tooling and CI defaults; production deploy wiring is unchanged unless explicitly called out.

---

## 1. Goals and outcomes

- **Atomic changes:** API, mobile, web, and product docs can ship in **one PR** when behavior spans layers.
- **Single workspace for humans and agents:** One tree, one set of repo rules, search, and references—no coordinating multiple repositories or stacked PRs for routine cross-cutting work.
- **Shared packages when needed:** Layout supports `packages/*` (types, clients, config) without requiring extraction on day one.
- **Docs as a first-class citizen:** A single **`docs/`** tree (product + engineering workflow) lives in the same repo; CI can run doc checks in the same task graph as code.
- **Root entry points:** Standard top-level commands (via pnpm + Turborepo) for lint, typecheck, and build so CI and automation have a stable contract.

---

## 2. Chosen approach

**pnpm workspaces + Turborepo** (not Yarn v1 workspaces; not Nx for initial adoption).

**Rationale:** Strong install semantics and monorepo ergonomics, optional remote caching later, and a clear model for adding shared TS packages. Nx is deferred unless project count and boundary enforcement justify the extra framework.

---

## 3. Repository layout

| Path | Role |
|------|------|
| `nomlog-app/` | Expo / React Native app (workspace package). |
| `nomlog-api/` | Express API (workspace package). |
| `nomlog-web/` | Next.js app (workspace package). |
| `docs/` | **Canonical documentation root** (workspace package with minimal `package.json`). See **§3.1** for inner layout. |
| `packages/*` | Shared libraries (optional initially). |

**Root files (new or updated):** `package.json` (private root), `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml`, documented Node/pnpm version (e.g. `packageManager` field and/or `engines`).

### 3.1 Unified `docs/` tree (product + workflow)

**Problem today:** Product docs live under `nomlog-docs/` while agent/process artifacts live under `docs/superpowers/{specs,plans}/`. Cursor rules and mental model already point at **`docs/features`**, **`docs/FEATURES.md`**, etc.—so paths should match one tree.

**Target layout (phase 1 — preserve inner names, minimize link churn):**

- Move **all** current `nomlog-docs/*` content into **`docs/`** keeping familiar folders: `FEATURES.md`, `features/`, `roadmap/`, `stories/`, `prds/`, `deployment/`, `BUGS.md`, and other existing paths.
- Merge process docs: move **`docs/superpowers/specs/` → `docs/specs/`** and **`docs/superpowers/plans/` → `docs/plans/`** (then remove the empty `docs/superpowers/` hierarchy). Alternative if you prefer explicit separation: `docs/workflow/specs` and `docs/workflow/plans`; pick one convention and document it in `docs/README.md`.
- Add **`docs/README.md`** as the **navigation contract** for humans and agents:
  - **Direction** — `roadmap/` (ideas, roadmap, decisions / ADRs): what we might do and why.
  - **Product record** — `FEATURES.md`, `features/`, `stories/`, `prds/`: what the product is and user-facing behavior.
  - **Engineering workflow** — `specs/`, `plans/`: approved design → implementation plan (aligned with the superpowers spec/plan flow).
- **Optional (skill-ready):** for new or revised specs/plans, prefer YAML **frontmatter** (`kind`, `status`, `date`, `title`) so a future skill can filter and validate without custom parsers.

**Package name:** The Turborepo workspace member can be named e.g. `@nomlog/docs` or `nomlog-docs` in `package.json`; the **on-disk path** is **`docs/`**.

**Follow-up edits outside this spec:** Update any references that still say `nomlog-docs/` or `docs/superpowers/` (root README, `CLAUDE_PROJECT_CONTEXT.md`, CI, and Cursor rules) as part of the implementation plan.

---

## 4. Git: nested repository under legacy `nomlog-docs/`

Today `nomlog-docs/` may contain its own `.git` directory (nested repo). A true monorepo requires **one Git root** for all content that will live under **`docs/`**.

**Required migration:**

1. Preserve history if needed: e.g. `git filter-repo` or `git subtree` to bring `nomlog-docs` history into the parent, or accept a one-time copy if history is disposable.
2. After content lives under **`docs/`**, ensure there is **no** nested `.git` inside `docs/` so files are tracked only by the parent repository.
3. Update any tooling or docs that still describe `nomlog-docs` as a separate clone or a submodule.

Until this is done, “single PR for code + docs” is unreliable (submodule/nested-repo behavior).

---

## 5. Migration sequence (recommended order)

Phases are ordered to reduce thrash and keep the app runnable after each step.

1. **Normalize Git for docs:** Resolve nested `nomlog-docs` Git state; migrate content toward **`docs/`**; ensure all doc paths are tracked from repo root with a single `.git`.
2. **Introduce root workspace shell:** Add root `package.json`, `pnpm-workspace.yaml`, and `turbo.json` with minimal pipelines (e.g. `lint`, `typecheck`, `build` placeholders where a package has no script yet).
3. **Convert package manager per app:** Migrate `nomlog-api`, `nomlog-web`, and `nomlog-app` from Yarn/npm to pnpm-compatible manifests and lockfile at root. Remove or ignore per-package `yarn.lock` as appropriate after validation.
4. **Expo / React Native specifics:** Validate Metro, Expo, and any native modules under pnpm (`.npmrc` / `public-hoist-pattern` / `node-linker` as needed). Run `ios`/`android` or documented smoke checks in development.
5. **Wire Turborepo tasks:** Define `dependsOn` so builds respect internal package order when `packages/*` exists; start with independent apps if no shared packages yet.
6. **Unify doc paths:** Move `nomlog-docs/*` → `docs/`; merge `docs/superpowers/specs` and `docs/superpowers/plans` into `docs/specs` and `docs/plans` (or `docs/workflow/...` per §3.1); add `docs/README.md`; update references across the repo.
7. **`docs/` package:** Add `docs/package.json` and at least one CI-visible script (even a no-op or simple `lint`) so `turbo run` includes docs in the graph; expand to Markdown/link lint when desired.
8. **CI:** Replace or extend existing workflows to use `pnpm install` at root and `turbo run <tasks>` with appropriate filters; cache pnpm store and Turborepo cache per provider docs.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Expo / RN breaks under pnpm hoisting | Use documented pnpm settings for React Native; test dev client and EAS paths in development. |
| Long migration PR | Use phases above; keep app bootable after each phase where possible. |
| `nomlog-api` `postinstall` builds | Ensure workspace install does not cause recursive or slow installs; consider moving build to explicit `build` task in Turbo. |
| Version skew (Node) | Align `engines` across packages with `nomlog-web` (e.g. Node >= 20.x) and document in root README. |
| Agent/human confusion during transition | Short root README + **`docs/README.md`** (lifecycle and paths); “Install pnpm, run X from repo root.” |
| Broken links after `docs/` move | Grep for `nomlog-docs/` and `superpowers/`; run link checker in `docs` package when wired. |

---

## 7. Testing and verification

- **Local:** From repo root, `pnpm install`, then `turbo run lint` / `typecheck` / `build` (exact task names TBD in implementation plan) succeed.
- **nomlog-app:** Start dev server or run documented smoke test after pnpm migration.
- **nomlog-api:** `dev` and `build` paths work with workspace layout.
- **nomlog-web:** `next build` succeeds.
- **docs:** Turbo sees the `docs/` package; doc lint (and optional link check) runs green when enabled; `docs/README.md` reflects final paths.

---

## 8. Non-goals (initial phase)

- Mandatory extraction of shared types into `packages/*` (optional follow-up).
- Nx adoption or full design-system package split.
- Changing production hosting assumptions (Render, EAS, etc.) except where tooling requires manifest updates.

---

## 9. Approval and next step

This document is the agreed design baseline. After stakeholder review, the next artifact is an **implementation plan** (tasks, file checklist, CI diffs, rollback notes)—not ad-hoc repo edits without that plan.

---

## 10. Follow-up (after monorepo + `docs/` merge): Nomlog docs skill

**Out of scope for the initial monorepo migration.** Once **`docs/`** is canonical, **`docs/README.md`** is stable, and the **`docs/`** package has baseline **lint / link-check** (or equivalent) in CI:

- Add a **project-specific Cursor skill** (see repo **create-skill** guidance) that encodes the Nomlog documentation lifecycle: where **ideas**, **roadmap**, **specs**, **plans**, **features**, **stories**, and **ADRs** live; when to update **`FEATURES.md`** vs feature files; and naming/frontmatter conventions for **`docs/specs/`** and **`docs/plans/`**.
- The skill should **read `docs/README.md` as the contract** and defer to existing Cursor rules under **`.cursor/rules/`** where they overlap.
- Optional ecosystem skills (ADRs, changelogs, etc.) remain **additive**; they do not replace the Nomlog skill or CI checks.

This follow-up should be tracked in the **implementation plan** as a separate milestone after the docs tree and Turbo/CI wiring are complete.
