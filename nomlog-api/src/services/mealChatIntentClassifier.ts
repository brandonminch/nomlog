import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId, type LlmOwnerContext } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { z } from 'zod';

const MealChatIntentPayloadSchema = z.object({
  intent: z.enum(['log', 'plan', 'off_topic']),
});

export type MealChatIntent = 'log' | 'plan' | 'off_topic';

export type MealChatIntentClassifierInput = {
  mealDescription: string;
  conversationHistory?: Array<{ question: string; answer: string }>;
};

/**
 * Classifies the latest user message for the meal chat.
 * - "log": user is providing what they ate / clarifications for logging
 * - "plan": user is asking what they should eat / meal planning requests
 * - "off_topic": anything else
 */
export class MealChatIntentClassifier {
  private client: OpenAI;
  private modelName: string;
  private debugLogsEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.modelName = process.env.OPENAI_MODEL_NAME || process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.client = new OpenAI({ apiKey });
  }

  async classify(input: MealChatIntentClassifierInput, llm: LlmOwnerContext): Promise<MealChatIntent> {
    const conversationHistoryText = (input.conversationHistory ?? [])
      .slice(0, 8)
      .map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`)
      .join('\n\n');

    const classificationPrompt = [
      'Analyze the user message in Nomlog meal chat.',
      '',
      'Return JSON only with this schema:',
      '{ "intent": "log" | "plan" | "off_topic" }',
      '',
      'Rules:',
      '- intent="log": user provides what they ate (e.g., "I ate...", "for breakfast I had...") OR they answer clarifying questions about a meal to log it.',
      '- intent="plan": user asks what they should eat next or requests suggestions / meal plans (e.g., "what should I eat tonight?", "help me plan my meals").',
      '- intent="off_topic": anything unrelated to meal logging or meal planning.',
      '',
      'Context (may be empty):',
      `USER_MESSAGE:\n${input.mealDescription}`,
      '',
      `CONVERSATION_HISTORY:\n${conversationHistoryText || '(none)'}`,
      '',
      'If conversation history is present, treat it as a strong signal that the chat is in logging/clarification flow unless the user explicitly asks for meal planning.',
    ].join('\n');

    const payload: Record<string, unknown> = {
      model: this.modelName,
      input: classificationPrompt,
      reasoning: { effort: 'low' },
      max_output_tokens: 100,
      text: { format: zodResponsesTextFormat(MealChatIntentPayloadSchema, 'meal_chat_intent') },
    };

    const response = await createTrackedOpenAIResponse(
      this.client,
      payload as OpenAI.Responses.ResponseCreateParams,
      {
        userId: llm.userId,
        route: llm.route,
        tag: 'meal_chat_intent',
        requestGroupId: newLlmRequestGroupId(),
        attemptIndex: 0,
      }
    );
    const refusal = getRefusalFromResponse(response);
    if (refusal) {
      throw new Error(`Classifier refused: ${refusal}`);
    }
    const rawText = extractResponsesOutputText(response);

    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Classifier returned empty output');
    }

    if (this.debugLogsEnabled) {
      console.log('[mealChatIntentClassifier] rawText:', rawText);
    }

    const { intent } = parseModelJsonWithSchema(rawText, MealChatIntentPayloadSchema);
    return intent;
  }
}

