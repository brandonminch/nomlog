# Nomlog documentation

Single tree for product docs and engineering workflow. **Agents:** use this file as the path contract.

## Areas

- **Direction** — `roadmap/` (near-term plan, ideas, ADRs under `roadmap/decisions/`).
- **Product record** — `FEATURES.md`, `features/`, `stories/`, `prds/`, `deployment/`, `BUGS.md`.
- **Engineering workflow** — `specs/` (designs), `plans/` (implementation plans).

## Conventions

- Specs and plans: prefer `YYYY-MM-DD-<slug>.md` and optional YAML frontmatter (`kind`, `status`, `date`, `title`) on new files.
- Feature behavior vs future work: see `.cursor/rules/docs-stories.mdc` and `update-docs-on-features.mdc`.

## Monorepo note

Install dependencies from the **repository root** with **pnpm** (see root `README.md` when present).
