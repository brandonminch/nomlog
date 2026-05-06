/** 72h window aligned with Health import and `fetchRecentWorkouts` default. */
export const HEALTHKIT_RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;

export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type LogsRangeDay = {
  activities?: { external_id?: string | null; external_source?: string | null }[];
};
export type LogsRangeResponse = Record<string, LogsRangeDay>;

export function collectLoggedHealthKitIds(rangeData: LogsRangeResponse): Set<string> {
  const ids = new Set<string>();
  Object.values(rangeData).forEach((day) => {
    (day.activities ?? []).forEach((a) => {
      if (a.external_source === 'healthkit' && a.external_id) {
        ids.add(a.external_id);
      }
    });
  });
  return ids;
}

export function buildLogsRangeQueryParams(
  windowMs: number = HEALTHKIT_RECENT_WINDOW_MS
): { dateStart: string; dateEnd: string; timezone: string } {
  const end = new Date();
  const start = new Date(end.getTime() - windowMs);
  return {
    dateStart: formatDateString(start),
    dateEnd: formatDateString(end),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
