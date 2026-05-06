import OpenAI from 'openai';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  createTrackedOpenAIResponse,
  newLlmRequestGroupId,
  type LlmOwnerContext,
} from '../ai/openaiResponses';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { prompts, type PromptKey } from '../prompts';
import { ActivitySummary, ActivitySummarySchema } from '../types/activitySummary';
import type { ActivityExerciseSegment } from '../types/activityLog';
import { z } from 'zod';

const ActivityBurnResultSchema = z.object({
  totalCaloriesBurned: z.number(),
  segmentEnergyKcal: z
    .array(
      z.object({
        index: z.number(),
        energyKcal: z.number(),
      })
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
});

export type ActivityBurnResult = z.infer<typeof ActivityBurnResultSchema>;

export type UserProfileForBurn = {
  weightKg: number | null;
  heightCm: number | null;
  biologicalSex: string | null;
};

export class ActivityAiService {
  private client: OpenAI;
  private summaryPromptTemplate: PromptTemplate;
  private burnPromptTemplate: PromptTemplate;
  private modelName: string;
  private summaryModelName: string;
  private debugLogsEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.modelName = process.env.OPENAI_MODEL_NAME || 'gpt-5';
    this.summaryModelName = process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.client = new OpenAI({ apiKey });

    this.summaryPromptTemplate = PromptTemplate.fromTemplate(prompts.activitySummary);
    this.burnPromptTemplate = PromptTemplate.fromTemplate(prompts.activityBurn);
  }

  private getSummaryMaxOutputTokens(): number {
    const raw = (process.env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS || '').trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 4000;
  }

  private getBurnMaxOutputTokens(): number {
    return 2000;
  }

  private getReasoningEffort(): 'low' | 'medium' | 'high' {
    const value = (process.env.OPENAI_REASONING_EFFORT || 'low').toLowerCase();
    if (value === 'low' || value === 'medium' || value === 'high') {
      return value;
    }
    return 'low';
  }

  private async generateResponseText(
    input: string,
    options?: {
      structuredFormat?: ResponseFormatTextJSONSchemaConfig;
      reasoningEffort?: 'low' | 'medium' | 'high';
      maxOutputTokens?: number;
      model?: string;
      logTag?: string;
      promptKey?: PromptKey;
      llm?: LlmOwnerContext;
    }
  ): Promise<string> {
    const reasoningEffort = options?.reasoningEffort || this.getReasoningEffort();

    const payload: Record<string, unknown> = {
      model: options?.model || this.modelName,
      input,
      max_output_tokens: options?.maxOutputTokens ?? 8000,
      reasoning: { effort: reasoningEffort },
    };

    if (options?.structuredFormat) {
      payload.text = { format: options.structuredFormat };
    }

    const tag = options?.logTag || 'openai_activity';
    const requestGroupId = newLlmRequestGroupId();
    const llmUserId = options?.llm?.userId ?? null;
    const llmRoute = options?.llm?.route ?? null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await createTrackedOpenAIResponse(
          this.client,
          payload as OpenAI.Responses.ResponseCreateParams,
          {
            userId: llmUserId,
            route: llmRoute,
            tag,
            promptKey: options?.promptKey ?? null,
            requestGroupId,
            attemptIndex: attempt,
          }
        );
        const refusal = getRefusalFromResponse(response);
        if (refusal) {
          throw new Error(`OpenAI refused the request: ${refusal}`);
        }
        return extractResponsesOutputText(response);
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const message = ((err as { message?: string })?.message || '').toString();
        console.warn(`[${tag}] attempt ${attempt + 1} error`, { status, message });
        if (status !== 400) throw err;
        if (/reasoning\.effort|Unsupported parameter: 'reasoning\.effort'/i.test(message) && payload.reasoning) {
          delete payload.reasoning;
          continue;
        }
        if (/Unsupported parameter: 'max_output_tokens'/i.test(message) && 'max_output_tokens' in payload) {
          delete payload.max_output_tokens;
          continue;
        }
        if (/(Unsupported parameter: 'text'|text\.format)/i.test(message) && payload.text) {
          delete payload.text;
          continue;
        }
        throw err;
      }
    }
    throw new Error('Failed to generate activity AI response');
  }

  private buildFallbackQuestionSummary(questions: Array<{ text: string }>): string {
    const cleaned = questions
      .map((q) => (q.text || '').replace(/\bhttps?:\/\/\S+/gi, '').trim())
      .filter((text) => text.length > 0);
    if (cleaned.length === 0) return '';
    if (cleaned.length === 1) return cleaned[0];
    const first = cleaned[0].replace(/\?+$/g, '').trim();
    const secondRaw = cleaned[1].replace(/\?+$/g, '').trim();
    const second =
      secondRaw.length > 0
        ? secondRaw.charAt(0).toLowerCase() + secondRaw.slice(1)
        : '';
    if (!first) return `${second}?`;
    if (!second) return `${first}?`;
    return `${first} and ${second}?`;
  }

  private isDisallowedSuggestedOption(option: string): boolean {
    const normalized = option.trim().toLowerCase().replace(/[\s_\-()/:.]+/g, '');
    return normalized === 'other' || normalized === 'others' || normalized.startsWith('otherspecify');
  }

  private sanitizeSuggestedOptions(options?: string[] | null): string[] | undefined {
    if (options == null || !Array.isArray(options)) return undefined;
    const cleaned = options
      .map((opt) => opt.replace(/\bhttps?:\/\/\S+/gi, '').trim())
      .filter((opt) => opt.length > 0)
      .filter((opt) => !this.isDisallowedSuggestedOption(opt));
    if (cleaned.length === 0) return undefined;
    return cleaned;
  }

  private sanitizeSummary(summary: ActivitySummary): ActivitySummary {
    const items = summary.items.map((it) => {
      if (it.kind === 'cardio') {
        return {
          ...it,
          activityName: it.activityName.replace(/\bhttps?:\/\/\S+/gi, '').trim(),
        };
      }
      const sets =
        it.sets.length === 0
          ? [{} as { reps?: number; weightLbs?: number }]
          : it.sets.map((s) => ({
              reps: s.reps,
              weightLbs: s.weightLbs,
            }));
      return {
        ...it,
        exerciseName: it.exerciseName.replace(/\bhttps?:\/\/\S+/gi, '').trim(),
        sets,
      };
    });
    const sanitizedQuestions = (summary.questions || []).map((q) => ({
      ...q,
      text: q.text.replace(/\bhttps?:\/\/\S+/gi, '').trim(),
      options: this.sanitizeSuggestedOptions(q.options),
    }));
    const apiQuestionSummary = (summary.questionSummary || '').replace(/\bhttps?:\/\/\S+/gi, '').trim();
    const questionSummary =
      apiQuestionSummary.length > 0
        ? apiQuestionSummary
        : this.buildFallbackQuestionSummary(sanitizedQuestions);

    return {
      ...summary,
      name: summary.name.replace(/\bhttps?:\/\/\S+/gi, '').trim(),
      description: summary.description.replace(/\bhttps?:\/\/\S+/gi, '').trim(),
      questionSummary,
      items,
      questions: sanitizedQuestions,
      assumptions: Array.isArray(summary.assumptions) ? summary.assumptions : [],
    };
  }

  async analyzeActivityConversation(
    activityDescription: string,
    conversationHistory?: Array<{ question: string; answer: string }>,
    llm?: LlmOwnerContext
  ): Promise<ActivitySummary> {
    let conversationContext = '';
    if (conversationHistory?.length) {
      const historyLines = conversationHistory.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`);
      conversationContext = `\n\nCONVERSATION HISTORY (questions already asked and answered):\n${historyLines.join('\n\n')}\n\nIMPORTANT: Do NOT ask questions already answered. Prefer assumptions or empty questions when enough context exists.`;
    }

    const prompt = await this.summaryPromptTemplate.format({
      activityDescription: activityDescription + conversationContext,
    });

    const text = await this.generateResponseText(prompt, {
      reasoningEffort: 'low',
      maxOutputTokens: this.getSummaryMaxOutputTokens(),
      model: this.summaryModelName,
      logTag: 'openai_activity_summary',
      promptKey: 'activitySummary',
      llm,
      structuredFormat: zodResponsesTextFormat(ActivitySummarySchema, 'activity_summary', { strict: false }),
    });

    const validated = parseModelJsonWithSchema(text, ActivitySummarySchema);
    return this.sanitizeSummary(validated);
  }

  async estimateCaloriesBurned(
    params: {
      profile: UserProfileForBurn;
      activityName: string;
      activityDescription: string;
      exercises: ActivityExerciseSegment[];
    },
    llm?: LlmOwnerContext
  ): Promise<ActivityBurnResult> {
    const exercisesJson = JSON.stringify(params.exercises ?? []);
    const prompt = await this.burnPromptTemplate.format({
      weightKg: params.profile.weightKg != null ? String(params.profile.weightKg) : 'null',
      heightCm: params.profile.heightCm != null ? String(params.profile.heightCm) : 'null',
      biologicalSex: params.profile.biologicalSex ?? 'null',
      activityName: params.activityName,
      activityDescription: params.activityDescription,
      exercisesJson,
    });

    const text = await this.generateResponseText(prompt, {
      reasoningEffort: 'low',
      maxOutputTokens: this.getBurnMaxOutputTokens(),
      model: this.summaryModelName,
      logTag: 'openai_activity_burn',
      promptKey: 'activityBurn',
      llm,
      structuredFormat: zodResponsesTextFormat(ActivityBurnResultSchema, 'activity_burn_estimate'),
    });

    return parseModelJsonWithSchema(text, ActivityBurnResultSchema);
  }
}
