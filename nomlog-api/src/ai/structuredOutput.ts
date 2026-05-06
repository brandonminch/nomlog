/**
 * Helpers for OpenAI Responses API Structured Outputs (`text.format.type: json_schema`).
 *
 * Fallback policy (see NutritionService `generateResponseText`):
 * - Prefer `json_schema` + Zod-derived schema so the model matches your types.
 * - If a request returns HTTP 400 or an error message suggesting `text.format` /
 *   structured output incompatibility (e.g. some tool combinations), retry once with
 *   `RESPONSES_JSON_OBJECT_FORMAT` when `jsonObjectFallback` is enabled; then parse with
 *   `parseModelJsonWithSchema` (still validates with Zod).
 * - Refusals: check `getRefusalFromResponse` when the model returns a refusal part instead of JSON.
 */
import type OpenAI from 'openai';
// Subpath `openai/_vendor/zod-to-json-schema` resolves to a non-existent flat `.js` under CJS; use `index.js`.
import { zodToJsonSchema } from 'openai/_vendor/zod-to-json-schema/index.js';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import type { ZodType } from 'zod';

/** Plain JSON mode for Responses API `text.format` (fallback when `json_schema` is rejected). */
export const RESPONSES_JSON_OBJECT_FORMAT = { type: 'json_object' as const };

/**
 * Build `text.format` for the Responses API from a Zod schema (Structured Outputs).
 * Use `strict: false` if the API rejects the generated schema (e.g. some unions).
 */
export function zodResponsesTextFormat<ZodInput extends ZodType>(
  zodSchema: ZodInput,
  name: string,
  options?: { strict?: boolean; description?: string }
): ResponseFormatTextJSONSchemaConfig {
  const strict = options?.strict !== false;
  const schema = zodToJsonSchema(zodSchema, {
    openaiStrictMode: strict,
    name,
    nameStrategy: 'duplicate-ref',
    $refStrategy: 'extract-to-root',
    nullableStrategy: 'property',
  });
  return {
    type: 'json_schema',
    name,
    strict,
    schema: schema as { [key: string]: unknown },
    ...(options?.description ? { description: options.description } : {}),
  };
}

type OutputContent = { type?: string; text?: string; refusal?: string };

function walkOutputForRefusal(response: OpenAI.Responses.Response): string | null {
  const out = (response as unknown as { output?: unknown }).output;
  if (!Array.isArray(out)) return null;
  for (const item of out) {
    const contents = (item as { content?: unknown })?.content;
    if (!Array.isArray(contents)) continue;
    for (const c of contents as OutputContent[]) {
      if (c?.type === 'refusal' && typeof c.refusal === 'string' && c.refusal.trim()) {
        return c.refusal.trim();
      }
    }
  }
  return null;
}

/** When the model refuses (safety), the API may surface a refusal part instead of JSON text. */
export function getRefusalFromResponse(response: OpenAI.Responses.Response): string | null {
  return walkOutputForRefusal(response);
}

export function extractResponsesOutputText(response: OpenAI.Responses.Response): string {
  const r = response as unknown as {
    output_text?: string;
    output?: Array<{ content?: OutputContent[] }>;
  };
  if (typeof r.output_text === 'string' && r.output_text.length > 0) {
    return r.output_text;
  }
  const first = r.output?.[0]?.content?.[0];
  if (first?.type === 'output_text' && typeof first.text === 'string') {
    return first.text;
  }
  if (typeof first?.text === 'string') {
    return first.text;
  }
  return '';
}

/**
 * Prefer direct JSON.parse; fall back to first fenced/balanced JSON object (legacy models / JSON mode).
 */
export function extractFirstJson(text: string): string | null {
  const input = (text || '').trim();
  if (!input) return null;

  try {
    JSON.parse(input);
    return input;
  } catch {
    /* continue */
  }

  const fenceMatch = input.match(/```json[\r\n]+([\s\S]*?)```/i) || input.match(/```[\r\n]+([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());
  candidates.push(input);

  for (const candidate of candidates) {
    const extracted = extractBalancedJson(candidate);
    if (extracted) return extracted;
  }
  return null;
}

function extractBalancedJson(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const start = text[i];
    if (start !== '{' && start !== '[') continue;
    const closing = start === '{' ? '}' : ']';
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const current = text[j];
      if (current === start) depth++;
      else if (current === closing) depth--;
      if (depth === 0) {
        const slice = text.slice(i, j + 1);
        try {
          JSON.parse(slice);
          return slice;
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

export function parseModelJsonWithSchema<ZodInput extends ZodType>(
  text: string,
  zodSchema: ZodInput
): ReturnType<ZodInput['parse']> {
  const trimmed = (text || '').trim();
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    const extracted = extractFirstJson(text);
    if (!extracted) {
      throw new Error('Failed to parse JSON from model output');
    }
    raw = JSON.parse(extracted);
  }
  return zodSchema.parse(raw) as ReturnType<ZodInput['parse']>;
}

/** If the API rejects `json_schema` (e.g. with certain tools), retry with plain JSON object mode. */
export function shouldFallbackTextFormatToJsonObject(message: string): boolean {
  return /json_schema|structured output|text\.format|schema/i.test(message);
}
