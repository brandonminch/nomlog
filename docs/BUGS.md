## Nomlog - Known Bugs

This is a lightweight, human-maintained list of user-facing bugs and rough edges that we’ve observed. When a bug is fixed, update this file and, if needed, add a regression test.

---

### Onboarding

- **Text animation feels janky / inconsistent**
  - **Area**: Onboarding screens
  - **Symptom**: Text animations stutter or feel too abrupt when progressing through onboarding steps.
  - **Status**: Known, not yet triaged.

- **Scrolling issues on onboarding**
  - **Area**: Onboarding content scroll
  - **Symptom**: Automatic scrolling is buggy and does not scroll to correct position of new bot messages
  - **Status**: Known, not yet triaged.

---

### Dashboard – Meal Tracking

- **No loading indicator when tracking a meal**
  - **Area**: Dashboard meal group / “track meal” action
  - **Symptom**: When the user tracks a meal, there is no visible loading state on the meal group card; it can feel like the app did not properly analyze the nutrition of the meal while in progress.
  - **Status**: Known, UX polish needed.

- **Cannot retry meal log after network error**
  - **Area**: Meal logging / dashboard
  - **Symptom**: If a network error occurs while logging a meal, the user cannot easily retry the same input; they must re-enter the meal.
  - **Status**: Known, needs retry UX and error handling improvements.

---

### AI / Chat

- **Token budget exceeded surfaces as JSON parse error**
  - **Area**: AI responses parsing / error handling
  - **Symptom**: When the model hits a token budget limit, the response can be truncated/invalid and the app reports a JSON parse error instead of a clear “token limit exceeded” message.
  - **Status**: Known, needs better upstream error detection + user-facing copy.

