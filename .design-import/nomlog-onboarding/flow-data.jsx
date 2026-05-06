// Step definitions, copy variants (playful tone), and helpers.

const GOAL_OPTIONS = [
  { id: "lose_weight",     label: "Lose weight",         description: "Gentle calorie deficit to drop weight steadily.", emoji: "🥗", tint: "#dcfcee" },
  { id: "maintain_weight", label: "Maintain weight",     description: "Stay around your weight with balanced nomming.", emoji: "⚖️", tint: "#fef3c7" },
  { id: "build_muscle",    label: "Build muscle",        description: "Eat to support strength and gains over time.",    emoji: "💪", tint: "#ffe2e2" },
  { id: "track_intake",    label: "Track my intake",     description: "Just see what you eat and how it adds up.",       emoji: "📓", tint: "#e0e7ff" },
  { id: "training_event",  label: "Training for an event", description: "Fuel for a race, comp, or big goal.",          emoji: "🏃", tint: "#e9d5ff" },
];

const SEX_OPTIONS = [
  { id: "male",   label: "Male" },
  { id: "female", label: "Female" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
];

const ACTIVITY_OPTIONS = [
  { id: "sedentary",         label: "Sedentary",         description: "Mostly sitting, little to no exercise.",     emoji: "🛋️", tint: "#f3f4f6" },
  { id: "lightly_active",    label: "Lightly active",    description: "Light exercise 1–3 days/week.",              emoji: "🚶", tint: "#dcfcee" },
  { id: "moderately_active", label: "Moderately active", description: "Moderate exercise 3–5 days/week.",           emoji: "🚴", tint: "#fef3c7" },
  { id: "very_active",       label: "Very active",       description: "Hard exercise 6–7 days/week.",               emoji: "🏋️", tint: "#fff4e6" },
  { id: "extremely_active",  label: "Extra active",      description: "Very hard exercise or a physical job.",      emoji: "🔥", tint: "#ffe2e2" },
];

// Step ids and registry — used for progress + skipping
const ALL_STEPS = ["name", "goal", "age", "height", "weight", "sex", "activity", "review"];

// Playful copy with extra "nom" puns. Each step has 1-2 lines.
const COPY = {
  intro: (tone) => tone === "playful"
    ? "hey there, nom-rade! 👋\n\nwelcome to nomlog — the nom-iest meal tracker your phone has ever met. let's get acquainted before we start nomming, yeah?\n\nfirst things first: what should I call you? a name, a nickname, a nom de plume — your call."
    : "Hey there! 👋\n\nWelcome to Nomlog. We want to help you track your meals in the most intuitive way possible.\n\nLet's get to know each other a bit. What should I call you?",
  goal: (name, tone) => {
    const n = name?.trim() || "friend";
    return tone === "playful"
      ? `nice to nom you, ${n}! 🎉\n\nso, what brings you here? pick the vibe that's most you right now — no wrong answers.`
      : `Nice to meet you, ${n}! 🎉 What's your main goal right now?`;
  },
  age: (tone) => tone === "playful"
    ? "love that for you. 💜\n\nnow some quick stats so I can nom-alize your daily targets. when's your birthday?"
    : "Great! Let's gather some more info to tailor your experience. What's your date of birth?",
  height: (tone) => tone === "playful"
    ? "noted! how tall are we talking? feet & inches or centimeters — whichever feels right."
    : "What's your height? Feet & inches or centimeters — whatever works.",
  weight: (tone) => tone === "playful"
    ? "and current weight? slide the ruler — no judgement, just numbers."
    : "And your current weight?",
  sex: (tone) => tone === "playful"
    ? "biological sex helps me dial in calorie estimates. which fits best?"
    : "I use biological sex with your stats to make calorie estimates more accurate.",
  activity: (tone) => tone === "playful"
    ? "last one (pinky promise) — how active are you on a normal day?"
    : "How active are you day-to-day? This helps estimate energy use.",
  review: (tone) => tone === "playful"
    ? "all set! here's what I've got. tap anything to edit, then we'll get nomming."
    : "Here's everything I have. Tap anything to edit.",
  complete: (tone) => tone === "playful"
    ? "you're in! ✨ I crunched your stats and built your daily nom-budget."
    : "All set! Here are your daily targets.",
};

// Format helpers
function formatHeight(h, unit) {
  if (!h) return "";
  if (unit === "cm") return h.cm ? `${h.cm} cm` : "";
  if (h.ft != null) return `${h.ft}'${h.in ?? 0}"`;
  return "";
}
function formatDOB(dob) {
  if (!dob || !dob.month) return "";
  return `${dob.month} ${dob.day}, ${dob.year}`;
}
function ageFromDOB(dob) {
  if (!dob || !dob.year) return null;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = months.indexOf(dob.month);
  const today = new Date();
  let age = today.getFullYear() - dob.year;
  const md = today.getMonth() - m;
  if (md < 0 || (md === 0 && today.getDate() < dob.day)) age--;
  return age;
}
function heightToCm(h, unit) {
  if (unit === "cm") return h.cm || 170;
  return Math.round(((h.ft || 5) * 12 + (h.in ?? 9)) * 2.54);
}
function weightToKg(w, unit) {
  if (unit === "kg") return w;
  return w * 0.4536;
}
// Mifflin-St Jeor BMR + activity multiplier
function calculateTargets({ goal, sex, activity, dob, height, heightUnit, weight, weightUnit }) {
  const age = ageFromDOB(dob) || 30;
  const cm = heightToCm(height, heightUnit);
  const kg = weightToKg(weight, weightUnit);
  let bmr = 10 * kg + 6.25 * cm - 5 * age;
  if (sex === "male") bmr += 5;
  else if (sex === "female") bmr -= 161;
  else bmr -= 78; // averaged
  const mult = {
    sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55,
    very_active: 1.725, extremely_active: 1.9,
  }[activity] || 1.4;
  let cals = bmr * mult;
  if (goal === "lose_weight") cals -= 400;
  else if (goal === "build_muscle") cals += 250;
  else if (goal === "training_event") cals += 200;
  cals = Math.round(cals / 10) * 10;
  // macro split
  const proteinG = Math.round(kg * (goal === "build_muscle" ? 2.0 : goal === "lose_weight" ? 1.8 : 1.4));
  const fatG = Math.round((cals * 0.28) / 9);
  const carbG = Math.round((cals - proteinG * 4 - fatG * 9) / 4);
  return { calories: cals, protein: proteinG, carbs: carbG, fat: fatG };
}

Object.assign(window, {
  GOAL_OPTIONS, SEX_OPTIONS, ACTIVITY_OPTIONS, ALL_STEPS, COPY,
  formatHeight, formatDOB, ageFromDOB, calculateTargets,
});
