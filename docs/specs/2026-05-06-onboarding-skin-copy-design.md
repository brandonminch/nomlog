# Onboarding skin + copy — design spec

**Status:** Draft for review  
**Scope:** `nomlog-app` onboarding only (presentation and copy).  
**Reference:** `.design-import/nomlog-onboarding/` (HTML prototype; tokens in `colors_and_type.css`).

## Goal

Refresh onboarding so it matches the prototype’s **visual language** and **voice** while **reusing** `useOnboardingFlow`, existing step order, profile/stats mutations, and **server-side** nutrition calculations. No new product logic for skipping steps or “prototype tweaks.”

## In scope

1. **Copy** — Centralize onboarding strings (intro, per-step bot lines, review, summary/targets if shown) in one module, structured like the prototype’s `COPY` in `flow-data.jsx`. Ship **one** default voice for v1 (recommend **neutral** to match current production tone; playful strings can live behind a single constant or remote flag without any in-app “tweaks panel”).
2. **Chrome** — Header area: brand mark, optional “typing / online” state, **step *n* of *N***, gradient **progress bar** (presentation only; derived from existing step).
3. **Chat transcript** — Bot and user bubble styling (spacing, radii, colors, type) aligned with prototype and existing RN token hex values where already used.
4. **Composer / bottom area** — While the bot message is streaming, show a **typing indicator** in the input region instead of the step control (mirror prototype `ChatTypingHint`); reuse existing streaming state from the hook/screen.
5. **Inputs (design-influenced)**  
   - **Name:** Reskin `OnboardingInputBar` toward prototype `NomTextInput` (pill, shadow, primary send control). Prefer **lucide-react-native** for the send icon per project rules.  
   - **Goal / sex / activity:** Choice rows like prototype `NomChoiceList` (emoji + tinted tile + clear selected state) where those steps are shown inline; keep the same option ids and handlers. If modals (`SummaryWheelPicker`) remain for some interactions, restyle them for consistency (typography, selection, primary button).  
   - **DOB / height / weight:** Same data contract as today. Minimum: restyle existing pickers/modals. **Optional stretch:** inline **ruler/slider-style** weight UI (and similarly influenced height UI) that still commits values the hook/API already expect—no client-side target math from the prototype.
6. **Review** — Row layout and “Edit” affordance like prototype `ReviewRow` (`OnboardingReviewSummary` and related).
7. **Post-review / targets** — If the flow shows calorie/macro targets, **restyle only** (e.g. ring, macro tiles, light motion); numbers remain from the **API**, not `calculateTargets` in the prototype.

## Out of scope

- Prototype **tweaks panel**, **skip age/sex/activity** toggles, or any conditional step removal not already in product requirements.
- **Splash** screen (unless added as a separate product decision later).
- Porting prototype **`calculateTargets`** or any nutrition formula; backend/recalc behavior unchanged.
- Changing onboarding **step order** or persistence semantics beyond what’s required for UI (e.g. no new steps).

## Success criteria

- Onboarding completes end-to-end with the same **profile/stats** fields populated as before.
- Visual parity with the prototype for **header, progress, choice cards, and input bar** within RN constraints (not pixel-perfect web).
- Copy is **editable in one place** without hunting through `OnboardingScreen.tsx`.
- No new user-facing controls that imply “debug” or “skip” behavior from the prototype.

## Risks / notes

- **Weight/height inline controls:** If implemented, must map cleanly to existing string/unit formats expected by `useOnboardingFlow` and `patchStats` to avoid subtle bugs.
- **Accessibility:** Ensure contrast and touch targets remain acceptable after reskinning.
- **Reference assets:** `.design-import/` may stay local; add to `.gitignore` if the team does not want the zip contents in the repo.

## Approval

Proceed to implementation plan after product/design sign-off on this spec.
