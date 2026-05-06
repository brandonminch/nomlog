/**
 * Express 5 types `req.params` values as `string | string[]`.
 * Use the first segment when an array appears (repeat param names).
 */
export function singleRouteParam(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
