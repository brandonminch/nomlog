/** Whole years of age from YYYY-MM-DD in the user's IANA timezone. */
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

export function formatDateOfBirthDisplay(iso: string, locale = 'en-US'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
