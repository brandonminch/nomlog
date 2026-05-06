/**
 * Query param `logger` on `/chat` — which logger to open (meal vs activity stub).
 * Example: router.push({ pathname: '/chat', params: { logger: 'activity' } })
 */
export type LoggerKind = 'meal' | 'activity';

/**
 * Query param `mode` on `/chat` — whether meal chat is focused on logging or planning.
 * Example: router.push({ pathname: '/chat', params: { mode: 'plan' } })
 */
export type ChatMode = 'log' | 'plan';

export function parseChatLoggerParam(raw: string | string[] | undefined): LoggerKind | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || typeof v !== 'string') return undefined;
  const k = v.trim().toLowerCase();
  if (k === 'activity') return 'activity';
  if (k === 'meal') return 'meal';
  return undefined;
}

export function parseChatModeParam(raw: string | string[] | undefined): ChatMode | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || typeof v !== 'string') return undefined;
  const k = v.trim().toLowerCase();
  if (k === 'log') return 'log';
  if (k === 'plan') return 'plan';
  return undefined;
}
