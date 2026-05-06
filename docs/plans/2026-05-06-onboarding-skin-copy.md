# Onboarding skin + copy — implementation plan

> **For agentic workers:** Use **superpowers:subagent-driven-development** or **superpowers:executing-plans** to implement task-by-task. Track with checkbox steps.

**Goal:** Reskin onboarding and centralize copy to match the design prototype, without changing step logic, skips, or nutrition calculation source.

**Architecture:** Keep `useOnboardingFlow` as the single source of onboarding state. Add a copy module and small presentational components (or StyleSheet sections) for header, progress, choice rows, and reskinned inputs. Prefer restyling `SummaryWheelPicker` and `OnboardingInputBar` before introducing inline slider/ruler controls.

**Tech stack:** React Native (Expo), existing hooks/mutations, `lucide-react-native` for new/changed icons.

**Design spec:** [../specs/2026-05-06-onboarding-skin-copy-design.md](../specs/2026-05-06-onboarding-skin-copy-design.md)

---

## File map (expected)

| Area | Files (illustrative) |
|------|----------------------|
| Copy | New: `nomlog-app/src/features/onboarding/onboardingCopy.ts` (or `src/constants/onboardingCopy.ts`) |
| Screen layout | `nomlog-app/src/screens/OnboardingScreen.tsx` |
| Input bar | `nomlog-app/src/components/OnboardingInputBar.tsx` |
| Review | `nomlog-app/src/components/OnboardingReviewSummary.tsx` |
| Pickers | `nomlog-app/src/components/SummaryWheelPicker.tsx`, `SummaryOptionPicker.tsx`, `DateOfBirthPickerModal.tsx` |
| Optional new UI | New: e.g. `OnboardingProgressHeader.tsx`, `OnboardingChoiceRow.tsx`, `OnboardingWeightControl.tsx` (only if inline weight UX is in scope) |
| Docs | `docs/features/conversational-onboarding.md` if user-visible copy or flow **appearance** changes merit it |

---

### Task 1: Onboarding copy module

**Files:**
- Create: `nomlog-app/src/.../onboardingCopy.ts` (exact path per repo convention)
- Modify: `nomlog-app/src/screens/OnboardingScreen.tsx` (replace hardcoded strings)

- [ ] **Step 1:** Add `onboardingCopy` with functions or keys for intro, goal, age, height, weight, sex, activity, review (mirror prototype `COPY` shape; one default tone).
- [ ] **Step 2:** Replace inline strings in `OnboardingScreen.tsx` (and any related components) to use the module.
- [ ] **Step 3:** Manual QA: walk through every step; confirm no string regressions.

---

### Task 2: Progress header + typing / online

**Files:**
- Modify: `OnboardingScreen.tsx`
- Optional create: `OnboardingProgressHeader.tsx`

- [ ] **Step 1:** Add header row: logo/avatar, title, subtitle (`typing…` / `online` from `isBotStreaming` or equivalent).
- [ ] **Step 2:** Add `stepIndex + 1` of `totalSteps` and a gradient progress bar (width from current step).
- [ ] **Step 3:** Verify safe area and scroll layout still work.

---

### Task 3: Chat bubbles + composer typing hint

**Files:**
- Modify: `OnboardingScreen.tsx` (styles + conditional bottom area)

- [ ] **Step 1:** Adjust bot/user bubble styles toward prototype (colors, radius, spacing).
- [ ] **Step 2:** When bot is streaming, show typing dots in the **bottom input region** instead of the step control; when done streaming, show the real control.
- [ ] **Step 3:** Regression: name step, goal cards, and autoscroll (`useChatAutoscroll`) still behave correctly.

---

### Task 4: Goal / sex / activity choice rows

**Files:**
- Modify: `OnboardingScreen.tsx` (goal list renderers; possibly sex/activity if inline)
- Optional create: `OnboardingChoiceRow.tsx`

- [ ] **Step 1:** Implement card row UI: emoji, tinted background, label, description, selected indicator (ids unchanged).
- [ ] **Step 2:** Ensure `SummaryWheelPicker` flows for goal/sex/activity still work if used for edit/summary; align modal styling in Task 5 if needed.
- [ ] **Step 3:** QA all three selection types.

---

### Task 5: Restyle pickers and input bar

**Files:**
- Modify: `OnboardingInputBar.tsx`, `SummaryWheelPicker.tsx`, `DateOfBirthPickerModal.tsx` as needed

- [ ] **Step 1:** `OnboardingInputBar`: pill container, shadow, gradient or brand-colored send button; lucide send icon.
- [ ] **Step 2:** Wheel picker: fonts, colors, selection highlight, CTA button to match prototype.
- [ ] **Step 3:** DOB modal: visual alignment only.

---

### Task 6: Review summary rows

**Files:**
- Modify: `OnboardingReviewSummary.tsx`

- [ ] **Step 1:** Match prototype `ReviewRow` (uppercase label, value typography, Edit accent, card border).
- [ ] **Step 2:** QA edit flows from review.

---

### Task 7 (optional stretch): Inline weight / height controls

**Files:**
- New: control component(s); Modify: `OnboardingScreen.tsx`, possibly `useOnboardingFlow.ts` only if wiring needs a thin adapter

- [ ] **Step 1:** Confirm exact string/unit format expected by existing `height`/`weight` state and `patchStats`.
- [ ] **Step 2:** Build slider/ruler UI that updates the same state shape; no duplicate calculators.
- [ ] **Step 3:** QA imperial/metric and summary edit paths.

---

### Task 8: Targets / completion presentation (if applicable)

**Files:**
- Modify: components used after review (search for macro/calorie display in onboarding flow)

- [ ] **Step 1:** Restyle reveal only; data from API.
- [ ] **Step 2:** QA accept/adjust flows unchanged.

---

### Task 9: Docs + cleanup

**Files:**
- Modify: `docs/features/conversational-onboarding.md` if UI/description changes
- Optional: `.gitignore` entry for `.design-import/` if desired

- [ ] **Step 1:** Update feature doc if user-visible experience changed materially.
- [ ] **Step 2:** Remove stray debug styles; run lint/tests per project norms.

---

## Testing

- Complete onboarding on a clean profile; resume mid-flow; edit from review.
- Confirm Posthog/events if the screen fires analytics (no broken event names).
- Device: at least one iOS and one Android pass if the team supports both.
