/**
 * Whole years of age from a calendar date of birth, evaluated in `timeZone`
 * (IANA name, e.g. America/New_York). Uses the user's local calendar date for "today".
 */
export function getAgeYearsFromDateOfBirth(
  dateOfBirthIso: string,
  now: Date,
  timeZone: string
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthIso)) {
    throw new Error('date_of_birth must be YYYY-MM-DD');
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = fmt.format(now);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [by, bm, bd] = dateOfBirthIso.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) {
    age -= 1;
  }
  return age;
}

/** Legacy conversational age → placeholder DOB (Jan 1) for migration / age_input fallback. */
export function approximateIsoDateFromAgeYears(ageYears: number): string {
  const y = new Date().getUTCFullYear() - ageYears;
  return `${String(y).padStart(4, '0')}-01-01`;
}
