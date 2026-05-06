# User Stories

This directory contains feature-specific backlogs of user stories and related implementation notes. Each file here covers a feature area and holds multiple stories for that feature.

Use these docs when you are getting ready to implement or refine a feature; high-level roadmap and ideation still live in `docs/roadmap/`.

## Files

| Feature area | Stories doc |
|-------------|-------------|
| Meal Logging | [meal-logging.md](meal-logging.md) |
| Meal Planning Chat | [meal-planning-chat.md](meal-planning-chat.md) |
| Conversational Onboarding | [conversational-onboarding.md](conversational-onboarding.md) |

Most stories docs correspond to a feature doc under `../features/` (same slug, different directory). For unimplemented features, the stories doc may instead point to a PRD or spec in `../prds/`. Create new entries in this table only when you add a stories file for that feature.

## File-level frontmatter

Each feature stories file starts with a small YAML frontmatter block that identifies the feature and links back to the main source document:

```markdown
---
feature: meal-logging
area: Meal Logging
source_doc: ../features/meal-logging.md
---
```

## Story format and metadata

Within each feature stories file, add one section per story under the `## Backlog` heading.

Each story has:

- A Markdown heading `## <ID>: <Title>`
- A lightweight YAML metadata block (not top-of-file frontmatter) with:
  - `id` — short, per-feature identifier (e.g. `ML-001`).
  - `status` — one of `idea`, `ready`, `in-progress`, `done`, `blocked`.
  - `priority` — `P0`, `P1`, `P2`, `P3`.
  - `type` — `story`, `tech-spike`, or `bug` (optional but useful).
  - `release` — `mvp` or `post-mvp` (use `mvp` only for must-ship items to reach MVP).
  - `feature` — the feature slug (e.g. `meal-logging`).
  - `links` — optional list of related docs (roadmap item, ADR, feature doc section).

### Canonical story template

Use this template when adding a new story:

```markdown
## <ID>: <Short title>

---
id: <ID>
status: idea | ready | in-progress | done | blocked
priority: P0 | P1 | P2 | P3
type: story | tech-spike | bug
release: mvp | post-mvp
feature: <feature-slug>
links:
  - <optional-link-1>
  - <optional-link-2>
---

**As a** <user or persona>
**I want** <goal or action>
**So that** <outcome or value>.

### Acceptance criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

### Implementation notes (optional)

- <technical hints, architecture considerations, edge cases>

### Test cases (optional)

- [ ] <happy path>
- [ ] <edge case>

### Figma prompt (optional)

> <Paste this prompt directly into Figma AI or a design tool to generate a UI mockup for this story.>
```

The Figma prompt section is optional but recommended for any story with a meaningful UI surface. Write it as a short blockquote that can be pasted directly into Figma AI. Focus only on what needs to be designed for this specific screen — skip global app context. A good prompt covers:

- **What the user sees** — key UI elements, layout, chat bubbles, cards, etc.
- **States to show** — default, selected, error, empty, etc.
- **Key interactions** — buttons, inputs, toggles visible on screen

### Example story

```markdown
## ML-001: Log a simple meal

---
id: ML-001
status: ready
priority: P1
type: story
release: mvp
feature: meal-logging
links:
  - ../features/meal-logging.md
  - ../roadmap/roadmap.md#meal-logging-enhancements
---

**As a** busy user
**I want** to quickly log what I ate with minimal typing
**So that** I can keep an accurate food log without friction.

### Acceptance criteria

- [ ] User can log a meal with a single short description.
- [ ] System infers meal time when not specified.
- [ ] Confirmation screen shows nutrition summary before saving.

### Notes / Open questions

- How strict should validation be when nutrition analysis fails?
```

## ID conventions

- Prefix IDs with a short feature code to avoid collisions and keep things readable: e.g. `AUTH-001`, `ML-001`, `NUTR-001`.
- IDs only need to be unique within a feature file; link them using `stories/<feature-file>.md#<sanitized-heading>` when needed.

