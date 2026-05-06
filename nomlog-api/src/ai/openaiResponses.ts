import OpenAI from 'openai';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import posthog from '../config/posthog';
import { promptVersionFor, type PromptKey } from '../prompts';
import { getUserLlmQuotaConfig } from './llmQuotaConfig';

/** User-attributed API route context for quotas + analytics. */
export type LlmOwnerContext = {
  userId: string;
  route: string;
};

export type LlmCallContext = {
  /** Supabase auth user id; null for internal scripts (no per-user quota). */
  userId: string | null;
  route?: string | null;
  tag?: string | null;
  /** When set, `prompt_version` is derived from `src/prompts/index.ts` for analytics + ledger. */
  promptKey?: PromptKey | null;
  requestGroupId: string;
  attemptIndex: number;
};

export class LlmQuotaExceededError extends Error {
  readonly code = 'LLM_QUOTA_EXCEEDED' as const;

  constructor(message = 'LLM token budget exceeded for this period') {
    super(message);
    this.name = 'LlmQuotaExceededError';
  }
}

/** Use in route `catch` blocks so quota errors return 429 instead of 500. */
export function replyIfLlmQuotaExceeded(res: Response, err: unknown): boolean {
  if (err instanceof LlmQuotaExceededError) {
    res.status(429).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

async function sumTokensSince(userId: string, sinceIso: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('sum_llm_tokens_since', {
    p_user_id: userId,
    p_since: sinceIso,
  });
  if (error) {
    console.warn('[llm_usage] sum_llm_tokens_since failed; allowing request', error.message);
    return 0;
  }
  return Number(data ?? 0);
}

async function assertWithinBudget(userId: string | null): Promise<void> {
  if (!userId) return;
  const cfg = await getUserLlmQuotaConfig(userId);
  const since = new Date(Date.now() - cfg.windowSeconds * 1000).toISOString();
  const used = await sumTokensSince(userId, since);
  if (used >= cfg.limitTokens) {
    throw new LlmQuotaExceededError();
  }
}

function parseUsage(response: OpenAI.Responses.Response): {
  input: number;
  output: number;
  total: number;
  raw: Record<string, unknown> | null;
} {
  const u = (response as unknown as { usage?: Record<string, unknown> }).usage;
  if (!u || typeof u !== 'object') {
    return { input: 0, output: 0, total: 0, raw: null };
  }
  const input =
    Number((u as { input_tokens?: number }).input_tokens) ||
    Number((u as { prompt_tokens?: number }).prompt_tokens) ||
    0;
  const output =
    Number((u as { output_tokens?: number }).output_tokens) ||
    Number((u as { completion_tokens?: number }).completion_tokens) ||
    0;
  let total = Number((u as { total_tokens?: number }).total_tokens) || 0;
  if (!total && (input || output)) total = input + output;
  return { input, output, total, raw: u as Record<string, unknown> };
}

function posthogDistinctId(ctx: LlmCallContext): string {
  if (ctx.userId) return ctx.userId;
  return (process.env.LLM_ANALYTICS_DISTINCT_ID || 'nomlog-api-internal').trim() || 'nomlog-api-internal';
}

function shortErrMessage(err: unknown, max = 200): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > max ? `${m.slice(0, max)}…` : m;
}

/**
 * Single OpenAI Responses API call with quota pre-check, Supabase ledger insert, and PostHog capture.
 */
export async function createTrackedOpenAIResponse(
  client: OpenAI,
  params: OpenAI.Responses.ResponseCreateParams,
  ctx: LlmCallContext
): Promise<OpenAI.Responses.Response> {
  await assertWithinBudget(ctx.userId);

  const model = typeof params.model === 'string' ? params.model : null;
  const promptKey = ctx.promptKey ?? null;
  const promptVersion = ctx.promptKey != null ? promptVersionFor(ctx.promptKey) : null;
  const started = Date.now();

  try {
    const response = (await client.responses.create(
      params
    )) as OpenAI.Responses.Response;
    const ms = Date.now() - started;
    const { input, output, total, raw } = parseUsage(response);
    const responseId =
      (response as unknown as { id?: string }).id != null
        ? String((response as unknown as { id?: string }).id)
        : null;

    const { error: insertErr } = await supabaseAdmin.from('llm_usage').insert({
      user_id: ctx.userId,
      provider: 'openai',
      endpoint: 'responses',
      route: ctx.route ?? null,
      tag: ctx.tag ?? null,
      prompt_key: promptKey,
      prompt_version: promptVersion,
      model,
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
      response_id: responseId,
      usage_json: raw,
      request_group_id: ctx.requestGroupId,
      attempt_index: ctx.attemptIndex,
    });
    if (insertErr) {
      console.warn('[llm_usage] insert failed (OpenAI call already succeeded)', insertErr.message);
    }

    posthog.capture({
      distinctId: posthogDistinctId(ctx),
      event: 'llm_response_succeeded',
      properties: {
        provider: 'openai',
        endpoint: 'responses',
        model,
        tag: ctx.tag ?? null,
        route: ctx.route ?? null,
        prompt_key: promptKey,
        prompt_version: promptVersion,
        latency_ms: ms,
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        openai_response_id: responseId,
        request_group_id: ctx.requestGroupId,
        attempt_index: ctx.attemptIndex,
      },
    });

    return response;
  } catch (err: unknown) {
    const ms = Date.now() - started;
    const status = (err as { status?: number })?.status;
    const code = (err as { code?: string })?.code;

    posthog.capture({
      distinctId: posthogDistinctId(ctx),
      event: 'llm_response_failed',
      properties: {
        provider: 'openai',
        endpoint: 'responses',
        model,
        tag: ctx.tag ?? null,
        route: ctx.route ?? null,
        prompt_key: promptKey,
        prompt_version: promptVersion,
        latency_ms: ms,
        error_status: status ?? null,
        error_code: code ?? null,
        error_message_short: shortErrMessage(err),
        request_group_id: ctx.requestGroupId,
        attempt_index: ctx.attemptIndex,
      },
    });

    throw err;
  }
}

export function newLlmRequestGroupId(): string {
  return randomUUID();
}
