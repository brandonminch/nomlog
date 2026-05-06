import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId, type LlmOwnerContext } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { z } from 'zod';

const ActivityChatIntentPayloadSchema = z.object({
  intent: z.enum(['log', 'off_topic']),
});

export type ActivityChatIntent = 'log' | 'off_topic';

export type ActivityChatIntentClassifierInput = {
  activityDescription: string;
  conversationHistory?: Array<{ question: string; answer: string }>;
};

/**
 * Classifies the latest user message for activity / workout chat.
 */
export class ActivityChatIntentClassifier {
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

  async classify(input: ActivityChatIntentClassifierInput, llm: LlmOwnerContext): Promise<ActivityChatIntent> {
    const conversationHistoryText = (input.conversationHistory ?? [])
      .slice(0, 8)
      .map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`)
      .join('\n\n');

    const classificationPrompt = [
      'Analyze the user message in Nomlog workout / activity chat.',
      '',
      'Return JSON only with this schema:',
      '{ "intent": "log" | "off_topic" }',
      '',
      'Rules:',
      '- intent="log": user describes a workout, exercise, run, walk, sport, sets/reps, duration, distance, or answers clarifying questions about logging activity.',
      '- intent="off_topic": anything unrelated to logging physical activity or exercise.',
      '',
      'USER_MESSAGE:',
      input.activityDescription,
      '',
      'CONVERSATION_HISTORY:',
      conversationHistoryText || '(none)',
      '',
      'If conversation history is present, treat it as logging/clarification flow unless the message is clearly off-topic.',
    ].join('\n');

    const payload: Record<string, unknown> = {
      model: this.modelName,
      input: classificationPrompt,
      reasoning: { effort: 'low' },
      max_output_tokens: 100,
      text: { format: zodResponsesTextFormat(ActivityChatIntentPayloadSchema, 'activity_chat_intent') },
    };

    const response = await createTrackedOpenAIResponse(
      this.client,
      payload as OpenAI.Responses.ResponseCreateParams,
      {
        userId: llm.userId,
        route: llm.route,
        tag: 'activity_chat_intent',
        requestGroupId: newLlmRequestGroupId(),
        attemptIndex: 0,
      }
    );
    const refusal = getRefusalFromResponse(response);
    if (refusal) {
      throw new Error(`Activity classifier refused: ${refusal}`);
    }
    const rawText = extractResponsesOutputText(response);

    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Activity classifier returned empty output');
    }

    if (this.debugLogsEnabled) {
      console.log('[activityChatIntentClassifier] rawText:', rawText);
    }

    const { intent } = parseModelJsonWithSchema(rawText, ActivityChatIntentPayloadSchema);
    return intent;
  }
}
