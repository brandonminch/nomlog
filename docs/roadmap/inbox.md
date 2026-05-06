# Roadmap inbox

Use this as a low-friction capture point for “we should do this” items that are **not** fully formed stories/PRDs yet.

## Rules of thumb

- Add items here when they’re **real TODOs** but you don’t want to write a full story/PRD yet.
- Keep entries short; include just enough context to be promotable later.
- During triage, every item should be promoted to **one** of:
  - `docs/roadmap/roadmap.md` (committed + sequenced)
  - `docs/stories/*` (implementation-ready)
  - `docs/prds/*` (needs product spec)
  - `docs/roadmap/ideas.md` (not committed / maybe someday)
- When promoted, keep the line but flip `status: promoted` and add a `promoted_to:` pointer (prefer IDs over file links).

## Inbox items

- title: View/edit macro and calorie goals during onboarding
  intent: mvp
  type: feature
  status: new
  area: onboarding / goals
  notes: Ensure users can review and adjust goals before finishing onboarding.

- title: Investigate better handling of nutrition service checks like "isSizeLikeOption"
  intent: research
  type: tech-debt
  status: new
  area: nutrition service
  notes: Evaluate whether current checks are efficient and scalable and propose a more maintainable approach.

