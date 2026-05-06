# Architecture Decision Records (ADRs)

This directory contains important decisions made for Nomlog. Each decision is recorded in a single markdown file so we can remember context and consequences later.

## Format

Name files with a zero-padded number and a short slug: `NNNN-title-slug.md` (e.g. `0001-supabase-auth.md`). Use the next available number when adding a new ADR.

Each ADR should include:

1. **Title** — One-line summary of the decision.
2. **Context** — What situation or problem led to this decision?
3. **Decision** — What did we decide?
4. **Consequences** — What are the trade-offs, benefits, and things to remember going forward?

Optional: **Status** (e.g. Accepted, Superseded by NNNN) and **Date**.

## Example structure

```markdown
# NNNN: Title of the decision

**Status:** Accepted  
**Date:** YYYY-MM-DD

## Context

...

## Decision

...

## Consequences

...
```

## Index

- [0001-supabase-auth.md](0001-supabase-auth.md) — Use Supabase for authentication
