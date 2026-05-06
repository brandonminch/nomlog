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
  RESPONSES_JSON_OBJECT_FORMAT,
  shouldFallbackTextFormatToJsonObject,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
// import { z } from 'zod';
import { prompts, type PromptKey } from '../prompts';
import { NutritionData, NutritionSchema } from '../types/nutrition';
import { MealSummary, MealSummarySchema } from '../types/mealSummary';
import { MealPhotoAnalysis, MealPhotoAnalysisSchema } from '../types/mealPhoto';

export class NutritionService {
  private client: OpenAI;
  private analysisPromptTemplate: PromptTemplate;
  private summaryPromptTemplate: PromptTemplate;
  private photoSummaryPromptTemplate: PromptTemplate;
  private modelName: string;
  private summaryModelName: string;
  private debugLogsEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    // Initialize the OpenAI client (Responses API)
    this.modelName = process.env.OPENAI_MODEL_NAME || 'gpt-5';
    this.summaryModelName = process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.client = new OpenAI({ apiKey });

    const analysisPromptTemplate = prompts.nutritionAnalysis;
    console.log('[NutritionService] Model:', this.modelName);
    console.log('[NutritionService] Summary model:', this.summaryModelName);
    console.log('[NutritionService] Analysis prompt loaded (chars):', analysisPromptTemplate.length);
    if (this.debugLogsEnabled) {
      console.log('[NutritionService] Analysis prompt preview:', analysisPromptTemplate.slice(0, 120).replace(/\n/g, ' '));
    }

    const summaryPromptTemplate = prompts.mealSummary;
    console.log('[NutritionService] Summary prompt loaded (chars):', summaryPromptTemplate.length);
    if (this.debugLogsEnabled) {
      console.log('[NutritionService] Summary prompt preview:', summaryPromptTemplate.slice(0, 120).replace(/\n/g, ' '));
    }

    this.analysisPromptTemplate = PromptTemplate.fromTemplate(analysisPromptTemplate);
    this.summaryPromptTemplate = PromptTemplate.fromTemplate(summaryPromptTemplate);
    const photoSummaryPromptTemplate = prompts.mealPhotoSummary;
    console.log('[NutritionService] Photo summary prompt loaded (chars):', photoSummaryPromptTemplate.length);
    this.photoSummaryPromptTemplate = PromptTemplate.fromTemplate(photoSummaryPromptTemplate);
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(
        value,
        (_key, v) => {
          if (typeof v === 'bigint') return v.toString();
          if (typeof v === 'function') return '[Function]';
          if (v instanceof Error) {
            return {
              name: v.name,
              message: v.message,
              stack: v.stack,
            };
          }
          return v;
        },
        2
      );
    } catch (err) {
      // Avoid throwing while trying to debug-log.
      return `[unstringifiable value: ${(err as any)?.message || String(err)}]`;
    }
  }

  private getSummaryMaxOutputTokens(): number {
    const raw = (process.env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS || '').trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 4000;
  }

  /** Full nutrition analysis (`analyzeMeal`): JSON + optional web search; defaults match prior hardcoded cap. */
  private getAnalysisMaxOutputTokens(): number {
    const raw = (process.env.OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS || '').trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 8000;
  }

  private stripUrls(text: string): string {
    const input = (text || '').toString();
    // Replace markdown links [label](url) -> label
    let out = input.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1');
    // Remove raw URLs
    out = out.replace(/\bhttps?:\/\/[^\s)]+/gi, '');
    out = out.replace(/\bwww\.[^\s)]+/gi, '');
    // Clean up leftover punctuation/spaces
    out = out.replace(/\(\s*\)/g, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    // Trim common trailing separators
    out = out.replace(/[|\-–—,:;]+\s*$/g, '').trim();
    return out;
  }

  private sanitizeNutritionData(data: NutritionData): NutritionData {
    const sanitized: NutritionData = {
      ...data,
      name: this.stripUrls(data.name),
      description: this.stripUrls(data.description),
      ingredients: (data.ingredients || []).map((ing) => ({
        ...ing,
        name: this.stripUrls(ing.name),
      })),
    };
    return sanitized;
  }

  private buildFallbackQuestionSummary(questions: Array<{ text: string }>): string {
    const cleaned = questions
      .map((q) => this.stripUrls(q.text || '').trim())
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

  private ensureQuestion(text: string): string {
    const trimmed = text.trim().replace(/\?+$/g, '');
    if (!trimmed) return '';
    return `${trimmed}?`;
  }

  private isDisallowedSuggestedOption(option: string): boolean {
    const normalized = option.trim().toLowerCase().replace(/[\s_\-()/:.]+/g, '');
    return (
      normalized === 'other' ||
      normalized === 'others' ||
      normalized.startsWith('otherspecify') ||
      normalized === 'somethingelse' ||
      normalized === 'anythingelse' ||
      normalized === 'custom'
    );
  }

  private sanitizeSuggestedOptions(options?: string[] | null): string[] | undefined {
    if (options == null || !Array.isArray(options)) return undefined;
    const cleaned = options
      .map((o) => this.stripUrls(o))
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
      .filter((o) => !this.isDisallowedSuggestedOption(o))
      .filter((o) => !this.isOverlySpecificOption(o));
    if (cleaned.length === 0) return undefined;
    return Array.from(new Set(cleaned)).slice(0, 5);
  }

  private shouldKeepClarifyingQuestion(
    question: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }
  ): boolean {
    const optionCount = question.options?.length ?? 0;
    return optionCount >= 2 && optionCount <= 5;
  }

  private fallbackAssumptionFromDroppedQuestion(
    question: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }
  ): string {
    switch (question.kind) {
      case 'portion':
        return 'assuming a typical portion size';
      case 'brand':
        return 'assuming a common/default product choice';
      case 'prep':
        return 'assuming a standard preparation method';
      default:
        return 'assuming typical details for unspecified items';
    }
  }

  private isOverlySpecificOption(option: string): boolean {
    const words = option.trim().split(/\s+/).filter(Boolean);
    if (option.length > 40) return true;
    if (words.length > 4) return true;
    if (/[,;:()]/.test(option)) return true;
    return false;
  }

  private isSizeLikeOption(option: string): boolean {
    const normalized = option.trim().toLowerCase();
    return (
      /\b(small|medium|large|xl|xs|regular|mini|single|double|triple)\b/.test(normalized) ||
      /\b(oz|ounce|ounces|g|gram|grams|lb|lbs|pound|pounds|cup|cups|slice|slices|piece|pieces|serving)\b/.test(
        normalized
      ) ||
      /\d/.test(normalized)
    );
  }

  private splitAttributePairQuestion(
    q: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }
  ): Array<{ id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }> {
    const base = q.text.trim().replace(/\?+$/g, '');
    const pattern =
      /^(what|which)\s+((?:size|portion|amount)\s+and\s+(?:type|kind|brand|flavor)|(?:type|kind|brand|flavor)\s+and\s+(?:size|portion|amount))\s+of\s+(.+)$/i;
    const match = base.match(pattern);
    if (!match) return [q];

    const target = match[3].trim().replace(/^(the|a|an)\s+/i, '').replace(/[.,!]+$/g, '');
    if (!target) return [q];

    const options = q.options || [];
    const typeOptions = options.filter((opt) => !this.isSizeLikeOption(opt));
    const sizeOptions = options.filter((opt) => this.isSizeLikeOption(opt));

    return [
      {
        id: `${q.id}_detail`,
        text: `What type of ${target}?`,
        kind: q.kind,
        options: typeOptions.length > 0 ? Array.from(new Set(typeOptions)).slice(0, 5) : undefined,
      },
      {
        id: `${q.id}_portion`,
        text: `What size of ${target}?`,
        kind: 'portion',
        options: sizeOptions.length > 0 ? Array.from(new Set(sizeOptions)).slice(0, 5) : undefined,
      },
    ];
  }

  private splitTypeAndSizeCombinedQuestion(
    q: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }
  ): Array<{ id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }> {
    const lower = q.text.toLowerCase();
    const hasTypeSignal =
      /(what|which)\s+(type|kind)/.test(lower) ||
      /\bbread type\b/.test(lower) ||
      /\bmain filling\b/.test(lower) ||
      /\bprotein\b/.test(lower);
    const hasSizeSignal =
      /\bwhat size\b/.test(lower) ||
      /\bsize\/serving\b/.test(lower) ||
      /\bserving size\b/.test(lower) ||
      /\bhow large\b/.test(lower) ||
      /\bhow big\b/.test(lower) ||
      /\bportion\b/.test(lower);

    if (!hasTypeSignal || !hasSizeSignal || !/\sand\s/i.test(q.text)) {
      return [q];
    }

    const base = q.text.trim().replace(/\?+$/g, '');
    const splitIdx = base.toLowerCase().indexOf(' and ');
    if (splitIdx <= 0) return [q];

    const firstRaw = base.slice(0, splitIdx).trim();
    const secondRaw = base.slice(splitIdx + 5).trim();
    if (!firstRaw || !secondRaw) return [q];

    const firstQuestion = this.ensureQuestion(firstRaw);
    const secondQuestion = this.ensureQuestion(
      /^[a-z]/.test(secondRaw) ? secondRaw.charAt(0).toUpperCase() + secondRaw.slice(1) : secondRaw
    );
    if (!firstQuestion || !secondQuestion) return [q];

    const leftOptions: string[] = [];
    const rightOptions: string[] = [];
    for (const opt of q.options || []) {
      const parts = opt.split(',');
      if (parts.length >= 2) {
        const left = parts[0].trim();
        const right = parts.slice(1).join(',').trim();
        if (left) leftOptions.push(left);
        if (right) rightOptions.push(right);
      } else {
        const cleaned = opt.trim();
        if (cleaned) leftOptions.push(cleaned);
      }
    }

    return [
      {
        id: `${q.id}_detail`,
        text: firstQuestion,
        kind: q.kind,
        options: leftOptions.length > 0 ? Array.from(new Set(leftOptions)).slice(0, 5) : undefined,
      },
      {
        id: `${q.id}_portion`,
        text: secondQuestion,
        kind: 'portion',
        options: rightOptions.length > 0 ? Array.from(new Set(rightOptions)).slice(0, 5) : undefined,
      },
    ];
  }

  private splitMultiItemAttributeQuestion(
    q: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }
  ): Array<{ id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }> {
    const base = q.text.trim().replace(/\?+$/g, '');
    const pattern =
      /^(what|which)\s+(type|kind|brand|flavor|size|portion|amount)\s+of\s+(.+?)\s+and\s+(.+?)(\s+(?:was|were|is|are|did you use|did you have|did you eat|do you use)(?:\s+[a-z]+)*)$/i;
    const match = base.match(pattern);
    if (!match) return [q];

    const wh = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const attribute = match[2].toLowerCase();
    const leftItem = match[3].trim().replace(/^(the|a|an)\s+/i, '').replace(/[.,!]+$/g, '');
    const rightItem = match[4].trim().replace(/^(the|a|an)\s+/i, '').replace(/[.,!]+$/g, '');
    const tail = match[5].trim();
    if (!leftItem || !rightItem || !tail) return [q];

    return [
      {
        id: `${q.id}_a`,
        text: `${wh} ${attribute} of ${leftItem} ${tail}?`,
        kind: q.kind,
      },
      {
        id: `${q.id}_b`,
        text: `${wh} ${attribute} of ${rightItem} ${tail}?`,
        kind: q.kind,
      },
    ];
  }

  /**
   * Enforce one clarifying detail per question for carousel UX.
   */
  private normalizeClarifyingQuestions(
    questions: Array<{ id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }>
  ): Array<{ id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }> {
    if (!Array.isArray(questions) || questions.length === 0) return questions;

    const splitAttributePairs = questions.flatMap((q) => this.splitAttributePairQuestion(q));
    const splitTypeAndSize = splitAttributePairs.flatMap((q) => this.splitTypeAndSizeCombinedQuestion(q));
    const splitMultiItem = splitTypeAndSize.flatMap((q) => this.splitMultiItemAttributeQuestion(q));
    return splitMultiItem.slice(0, 2);
  }

  private sanitizeMealSummary(summary: MealSummary): MealSummary {
    const rawQuestions = (summary.questions || []).map((q) => ({
      ...q,
      text: this.stripUrls(q.text),
      options: this.sanitizeSuggestedOptions(q.options),
    }));
    const normalizedQuestions = this.normalizeClarifyingQuestions(rawQuestions);
    const droppedQuestionAssumptions: string[] = [];
    const sanitizedQuestions = normalizedQuestions
      .filter((q) => {
        const keep = this.shouldKeepClarifyingQuestion(q);
        if (!keep) {
          droppedQuestionAssumptions.push(this.fallbackAssumptionFromDroppedQuestion(q));
        }
        return keep;
      })
      .slice(0, 2);
    const apiQuestionSummary = this.stripUrls(summary.questionSummary || '');
    const baseAssumptions = (summary.assumptions || [])
      .map((item) => this.stripUrls(item))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const assumptions = Array.from(new Set([...baseAssumptions, ...droppedQuestionAssumptions]));
    const questionSummary =
      apiQuestionSummary.length > 0 && sanitizedQuestions.length > 0
        ? apiQuestionSummary
        : this.buildFallbackQuestionSummary(sanitizedQuestions);

    const sanitized: MealSummary = {
      ...summary,
      name: this.stripUrls(summary.name),
      description: this.stripUrls(summary.description),
      questionSummary,
      ingredients: (summary.ingredients || []).map((ing) => ({
        ...ing,
        name: this.stripUrls(ing.name),
      })),
      questions: sanitizedQuestions,
      assumptions,
    };
    return sanitized;
  }

  async analyzeMeal(mealDescription: string, llm?: LlmOwnerContext): Promise<NutritionData> {
    try {
      // Format the prompt with the meal description
      const prompt = await this.analysisPromptTemplate.format({
        mealDescription,
      });

      const maxAnalysisTokens = this.getAnalysisMaxOutputTokens();

      // Structured output + web search; `generateResponseText` falls back to JSON object mode if the API rejects json_schema with tools.
      const text = await this.generateResponseText(prompt, {
        enableWebSearch: true,
        maxOutputTokens: maxAnalysisTokens,
        logTag: 'openai_analysis',
        promptKey: 'nutritionAnalysis',
        llm,
        structuredFormat: zodResponsesTextFormat(NutritionSchema, 'nutrition_analysis'),
        jsonObjectFallback: true,
        reasoningEffort: 'medium',
        temperature: 0.1,
      });

      let validatedData: NutritionData;
      try {
        validatedData = parseModelJsonWithSchema(text, NutritionSchema);
      } catch (parseErr) {
        console.error('analyzeMeal parse failed:', parseErr);
        console.error('Raw text length:', text.length, 'preview:', text.substring(0, 500));
        throw new Error('Failed to extract JSON from the response');
      }
      if (this.debugLogsEnabled) {
        console.log('[analyzeMeal] raw output_text length:', text.length);
        if (text.length <= 12000) {
          console.log('[analyzeMeal] raw output_text:', text);
        } else {
          console.log('[analyzeMeal] raw output_text (first 4000 chars):', text.slice(0, 4000));
        }
        console.log('[analyzeMeal] validated JSON:', JSON.stringify(validatedData, null, 2));
      }

      return this.sanitizeNutritionData(validatedData);
    } catch (error) {
      console.error('Nutrition analysis failed:', error);
      throw error;
    }
  }

  /**
   * Lightweight summary step for conversational logging.
   * Returns: name/description + questions/assumptions + optional ingredient list.
   * Does NOT compute nutrition totals in this step.
   */
  async analyzeMealConversation(
    mealDescription: string,
    conversationHistory?: Array<{ question: string; answer: string }>,
    llm?: LlmOwnerContext
  ): Promise<MealSummary> {
    const startedAt = Date.now();
    try {
      // Build conversation context string if history is provided
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        const historyLines = conversationHistory.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`);
        conversationContext = `\n\nCONVERSATION HISTORY (questions already asked and answered):\n${historyLines.join('\n\n')}\n\nIMPORTANT: Do NOT ask questions that have already been answered in the conversation history above. If you need more information, only ask NEW questions that haven't been covered yet. If you've already asked 2-3 questions or have enough information to proceed, return an empty questions array and use assumptions instead.`;
      }
      
      const prompt = await this.summaryPromptTemplate.format({
        mealDescription: mealDescription + conversationContext,
      });

      // Use lower reasoning effort for faster conversation analysis
      // This makes the initial step faster while still getting good estimates
      const maxOutputTokens = this.getSummaryMaxOutputTokens();
      const text = await this.generateResponseText(prompt, {
        reasoningEffort: 'low',
        enableWebSearch: false,
        maxOutputTokens,
        model: this.summaryModelName,
        logTag: 'openai_summary',
        promptKey: 'mealSummary',
        llm,
        structuredFormat: zodResponsesTextFormat(MealSummarySchema, 'meal_summary'),
      });

      const validated = parseModelJsonWithSchema(text, MealSummarySchema);
      if (this.debugLogsEnabled) {
        console.log('[analyzeMealConversation] raw output_text length:', text.length);
        if (text.length <= 12000) {
          console.log('[analyzeMealConversation] raw output_text:', text);
        } else {
          console.log('[analyzeMealConversation] raw output_text (first 4000 chars):', text.slice(0, 4000));
        }
        console.log('[analyzeMealConversation] validated JSON:', JSON.stringify(validated, null, 2));
      }
      console.log('[analyzeMealConversation] ok', { ms: Date.now() - startedAt, usedFallback: false });
      return this.sanitizeMealSummary(validated);
    } catch (error) {
      console.error('[analyzeMealConversation] failed:', error);
      console.log('[analyzeMealConversation] error', { ms: Date.now() - startedAt });
      throw error;
    }
  }

  async analyzeMealPhoto(photoUrls: string[], userContext: string | undefined, llm: LlmOwnerContext): Promise<MealPhotoAnalysis> {
    const prompt = await this.photoSummaryPromptTemplate.format({
      userContext: userContext?.trim() || 'none provided',
    });
    const urls = (photoUrls || []).filter((u) => typeof u === 'string' && u.trim().length > 0).slice(0, 4);
    if (urls.length === 0) {
      throw new Error('No photo URLs provided for meal photo analysis');
    }
    const payload: any = {
      model: this.summaryModelName,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            ...urls.map((u) => ({ type: 'input_image', image_url: u })),
          ],
        },
      ],
      text: { format: zodResponsesTextFormat(MealPhotoAnalysisSchema, 'meal_photo_analysis') },
      max_output_tokens: this.getSummaryMaxOutputTokens(),
      reasoning: { effort: 'medium' },
    };

    const requestGroupId = newLlmRequestGroupId();
    const response = await createTrackedOpenAIResponse(this.client, payload, {
      userId: llm.userId,
      route: llm.route,
      tag: 'openai_meal_photo',
      promptKey: 'mealPhotoSummary',
      requestGroupId,
      attemptIndex: 0,
    });
    const refusal = getRefusalFromResponse(response);
    if (refusal) {
      throw new Error('Meal photo analysis was refused');
    }
    const text = extractResponsesOutputText(response);
    const validated = parseModelJsonWithSchema(text, MealPhotoAnalysisSchema);
    if (this.debugLogsEnabled) {
      console.log('[analyzeMealPhoto] raw output_text length:', text.length);
      console.log('[analyzeMealPhoto] raw output_text:', text);
      console.log('[analyzeMealPhoto] validated JSON:', JSON.stringify(validated, null, 2));
    }
    return {
      ...validated,
      mealDescription: this.stripUrls(validated.mealDescription || ''),
      assumptions: (validated.assumptions || []).map((item) => this.stripUrls(item)),
      nonMealReason: validated.nonMealReason ? this.stripUrls(validated.nonMealReason) : undefined,
    };
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
      /** Structured Outputs (`text.format.type: json_schema`). */
      structuredFormat?: ResponseFormatTextJSONSchemaConfig;
      /** If true, downgrade to `json_object` once when `json_schema` triggers a 400 (e.g. with web_search). */
      jsonObjectFallback?: boolean;
      reasoningEffort?: 'low' | 'medium' | 'high';
      enableWebSearch?: boolean;
      maxOutputTokens?: number;
      /** Sampling temperature; omitted unless set (some reasoning models reject `temperature`). */
      temperature?: number;
      model?: string;
      timeoutMs?: number;
      logTag?: string;
      promptKey?: PromptKey;
      llm?: LlmOwnerContext;
    }
  ): Promise<string> {
    // Prepare payload and progressively remove unsupported params on 400 errors
    // Use provided reasoning effort or default
    let reasoningEffort = options?.reasoningEffort || this.getReasoningEffort();
    let usedJsonObjectFallback = false;

    // Web search is not compatible with minimal reasoning effort, upgrade to low if needed
    if (options?.enableWebSearch && reasoningEffort === 'low') {
      reasoningEffort = 'low';
      console.log('Upgraded reasoning effort from minimal to low for web search compatibility');
    }

    const payload: any = {
      model: options?.model || this.modelName,
      input,
      max_output_tokens: options?.maxOutputTokens ?? 8000,
      reasoning: { effort: reasoningEffort },
    };

    // Enable web search if requested
    if (options?.enableWebSearch) {
      payload.tools = [{ type: 'web_search' }];
    }

    if (options?.structuredFormat) {
      payload.text = { format: options.structuredFormat };
    }

    if (typeof options?.temperature === 'number') {
      payload.temperature = options.temperature;
    }

    const tag = options?.logTag || 'openai';
    const requestGroupId = newLlmRequestGroupId();
    const llmUserId = options?.llm?.userId ?? null;
    const llmRoute = options?.llm?.route ?? null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const startedAt = Date.now();
        if (this.debugLogsEnabled) {
          console.log(`[${tag}] attempt ${attempt + 1} payload:`, JSON.stringify(payload, null, 2));
        } else {
          console.log(`[${tag}] attempt ${attempt + 1} start`, {
            model: payload.model,
            max_output_tokens: payload.max_output_tokens,
            has_web_search: Boolean(payload.tools),
            has_response_format: Boolean(payload.response_format),
            temperature: payload.temperature,
          });
        }

        const timeoutMs = options?.timeoutMs;
        const runCreate = () =>
          createTrackedOpenAIResponse(this.client, payload as OpenAI.Responses.ResponseCreateParams, {
            userId: llmUserId,
            route: llmRoute,
            tag,
            promptKey: options?.promptKey ?? null,
            requestGroupId,
            attemptIndex: attempt,
          });

        const response = await (typeof timeoutMs === 'number' && timeoutMs > 0
          ? Promise.race([
              runCreate(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`OpenAI call timed out after ${timeoutMs}ms`)), timeoutMs)
              ),
            ])
          : runCreate());

        const ms = Date.now() - startedAt;
        console.log(`[${tag}] attempt ${attempt + 1} done`, { ms, status: (response as any)?.status });
        if (this.debugLogsEnabled) {
          console.log(`[${tag}] raw response (full):`, this.safeJsonStringify(response));
        }
        
        // Handle incomplete responses
        if (response.status === 'incomplete') {
          console.log('Response is incomplete, reason:', response.incomplete_details?.reason);
          if (response.incomplete_details?.reason === 'max_output_tokens') {
            // Try again with lower reasoning effort and higher token limit
            if (payload.reasoning?.effort === 'high') {
              payload.reasoning.effort = 'medium';
              payload.max_output_tokens = options?.maxOutputTokens ?? 8000;
              console.log('Retrying with medium reasoning effort and higher token limit');
              continue;
            } else if (payload.reasoning?.effort === 'medium') {
              payload.reasoning.effort = 'low';
              payload.max_output_tokens = options?.maxOutputTokens ?? 8000;
              console.log('Retrying with low reasoning effort and higher token limit');
              continue;
            }
          }
        }
        
        const refusal = getRefusalFromResponse(response);
        if (refusal) {
          throw new Error(`OpenAI refused the request: ${refusal}`);
        }
        const text = extractResponsesOutputText(response);
        if (this.debugLogsEnabled) {
          console.log(`[${tag}] extracted text:`, JSON.stringify(text));
        }
        return text;
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        const message: string = (err?.message || err?.response?.data?.error?.message || '').toString();
        console.warn(`[${tag}] attempt ${attempt + 1} error`, { status, message });
        if (status !== 400) throw err;
        if (
          options?.jsonObjectFallback &&
          options.structuredFormat &&
          !usedJsonObjectFallback &&
          payload.text?.format?.type === 'json_schema' &&
          shouldFallbackTextFormatToJsonObject(message)
        ) {
          payload.text = { format: RESPONSES_JSON_OBJECT_FORMAT };
          usedJsonObjectFallback = true;
          console.warn(`[${tag}] Retrying with json_object after structured output / text.format error`);
          continue;
        }
        if (/reasoning\.effort|Unsupported parameter: 'reasoning\.effort'/i.test(message) && payload.reasoning) {
          delete payload.reasoning;
          continue;
        }
        if (/Unsupported parameter: 'max_output_tokens'/i.test(message) && Object.prototype.hasOwnProperty.call(payload, 'max_output_tokens')) {
          delete payload.max_output_tokens;
          continue;
        }
        if (/Unsupported parameter: 'temperature'/i.test(message) && Object.prototype.hasOwnProperty.call(payload, 'temperature')) {
          delete payload.temperature;
          continue;
        }
        if (
          /(Unsupported parameter: 'response_format'|parameter has moved to 'text\.format'|text\.format)/i.test(message) &&
          Object.prototype.hasOwnProperty.call(payload, 'response_format')
        ) {
          delete payload.response_format;
          continue;
        }
        if (/(Unsupported parameter: 'text'|text\.format)/i.test(message) && payload.text) {
          delete payload.text;
          continue;
        }
        if (/(Unsupported parameter: 'tools'|web_search)/i.test(message) && payload.tools) {
          delete payload.tools;
          console.log('Web search not supported, continuing without it');
          continue;
        }
        // If we can't classify the unsupported field, rethrow
        throw err;
      }
    }
    throw new Error('Failed to generate response after removing unsupported parameters');
  }
  // Note: Question generation is handled by the model per prompt instructions.
} 