/**
 * Default `loggedAt` when opening the activity logger for a calendar day (no meal slot).
 * - If `dateString` is today: use current time.
 * - Otherwise: noon local on that date.
 */
export function getLoggedAtForActivityDay(dateString: string): Date {
  const parts = dateString.split('-').map((p) => Number.parseInt(p, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return new Date();

  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d) {
    return new Date(now);
  }
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
