import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId, type LlmOwnerContext } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { z } from 'zod';

const PhysicalStatsAgeSchema = z.object({
  ageYears: z.number().nullable(),
});

const PhysicalStatsHeightSchema = z.object({
  heightCm: z.number().nullable(),
  unit: z.enum(['cm', 'ft_in']),
});

const PhysicalStatsWeightSchema = z.object({
  weightKg: z.number().nullable(),
  unit: z.enum(['kg', 'lbs']),
});

type HeightResult = {
  heightCm: number;
  preferredUnit: 'cm' | 'ft_in';
};

type WeightResult = {
  weightKg: number;
  preferredUnit: 'kg' | 'lbs';
};

export class PhysicalStatsService {
  private client: OpenAI;
  private modelName: string;
  private debugLogsEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.modelName = process.env.OPENAI_STATS_MODEL_NAME || process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.client = new OpenAI({ apiKey });
  }

  async parseAge(input: string, llm: LlmOwnerContext): Promise<number> {
    const local = this.parseAgeLocal(input);
    if (local !== null) return local;
    const llmResult = await this.parseWithLLM('age', input, llm);
    if (!llmResult.ageYears || llmResult.ageYears < 10 || llmResult.ageYears > 100) {
      throw new Error("That age doesn't look right. Mind entering a whole number in years (e.g. 39)?");
    }
    return llmResult.ageYears;
  }

  async parseHeight(input: string, llm: LlmOwnerContext): Promise<HeightResult> {
    const local = this.parseHeightLocal(input);
    if (local) return local;
    const llmResult = await this.parseWithLLM('height', input, llm);
    if (!llmResult.heightCm || llmResult.heightCm < 100 || llmResult.heightCm > 250) {
      throw new Error("I couldn't quite understand that height. Try something like 5'10\" or 178cm.");
    }
    return {
      heightCm: llmResult.heightCm,
      preferredUnit: llmResult.unit === 'ft_in' ? 'ft_in' : 'cm',
    };
  }

  async parseWeight(input: string, llm: LlmOwnerContext): Promise<WeightResult> {
    const local = this.parseWeightLocal(input);
    if (local) return local;
    const llmResult = await this.parseWithLLM('weight', input, llm);
    if (!llmResult.weightKg || llmResult.weightKg < 30 || llmResult.weightKg > 300) {
      throw new Error('That weight did not go through. Try something like 150 lbs or 68 kg.');
    }
    return {
      weightKg: llmResult.weightKg,
      preferredUnit: llmResult.unit === 'lbs' ? 'lbs' : 'kg',
    };
  }

  private parseAgeLocal(input: string): number | null {
    const match = input.match(/(\d{1,3})/);
    if (!match) return null;
    const age = Number.parseInt(match[1], 10);
    if (!Number.isFinite(age) || age < 10 || age > 100) return null;
    return age;
  }

  private parseHeightLocal(input: string): HeightResult | null {
    const raw = input.toLowerCase();
    const cleaned = raw.replace(/,/g, '').trim();

    // Metric: contains cm or looks like 100–250
    const cmMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*cm\b/);
    if (cmMatch) {
      const cm = Number.parseFloat(cmMatch[1]);
      if (cm >= 100 && cm <= 250) {
        return { heightCm: cm, preferredUnit: 'cm' };
      }
    }
    const plainNumberMatch = cleaned.match(/^\s*(\d{3})\s*$/);
    if (plainNumberMatch) {
      const cm = Number.parseFloat(plainNumberMatch[1]);
      if (cm >= 100 && cm <= 250) {
        return { heightCm: cm, preferredUnit: 'cm' };
      }
    }

    // Imperial: 5'10", 5' 10, 5 ft 10 in, etc.
    const feetInchesMatch =
      cleaned.match(/(\d+)\s*['ft]+\s*(\d+)?\s*(?:in|"|$)/) ||
      cleaned.match(/(\d+)\s*ft\s*(\d+)?\s*(?:in)?/);
    if (feetInchesMatch) {
      const feet = Number.parseInt(feetInchesMatch[1], 10);
      const inches = feetInchesMatch[2] ? Number.parseInt(feetInchesMatch[2], 10) : 0;
      if (Number.isFinite(feet) && feet > 0 && feet < 8 && inches >= 0 && inches < 12) {
        const totalInches = feet * 12 + inches;
        const cm = totalInches * 2.54;
        return { heightCm: Math.round(cm * 10) / 10, preferredUnit: 'ft_in' };
      }
    }

    return null;
  }

  private parseWeightLocal(input: string): WeightResult | null {
    const raw = input.toLowerCase();
    const cleaned = raw.replace(/,/g, '').trim();

    // Metric
    const kgMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*kg\b/);
    if (kgMatch) {
      const kg = Number.parseFloat(kgMatch[1]);
      if (kg >= 30 && kg <= 300) {
        return { weightKg: kg, preferredUnit: 'kg' };
      }
    }

    // Imperial
    const lbMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pounds?)\b/);
    if (lbMatch) {
      const lbs = Number.parseFloat(lbMatch[1]);
      if (lbs >= 70 && lbs <= 650) {
        const kg = lbs * 0.45359237;
        return { weightKg: Math.round(kg * 10) / 10, preferredUnit: 'lbs' };
      }
    }

    // Plain number guess by magnitude
    const plainMatch = cleaned.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    if (plainMatch) {
      const value = Number.parseFloat(plainMatch[1]);
      if (!Number.isFinite(value)) return null;
      if (value >= 30 && value <= 200) {
        return { weightKg: value, preferredUnit: 'kg' };
      }
      if (value >= 70 && value <= 650) {
        const kg = value * 0.45359237;
        return { weightKg: Math.round(kg * 10) / 10, preferredUnit: 'lbs' };
      }
    }

    return null;
  }

  private async parseWithLLM(
    kind: 'age' | 'height' | 'weight',
    input: string,
    llm: LlmOwnerContext
  ): Promise<{ ageYears?: number; heightCm?: number; weightKg?: number; unit?: string }> {
    const prompt = this.buildPrompt(kind, input);
    const format =
      kind === 'age'
        ? zodResponsesTextFormat(PhysicalStatsAgeSchema, 'physical_stats_age')
        : kind === 'height'
          ? zodResponsesTextFormat(PhysicalStatsHeightSchema, 'physical_stats_height')
          : zodResponsesTextFormat(PhysicalStatsWeightSchema, 'physical_stats_weight');

    const response = await createTrackedOpenAIResponse(
      this.client,
      {
        model: this.modelName,
        input: prompt,
        max_output_tokens: 300,
        text: { format },
      },
      {
        userId: llm.userId,
        route: llm.route,
        tag: `physical_stats_${kind}`,
        requestGroupId: newLlmRequestGroupId(),
        attemptIndex: 0,
      }
    );

    const refusal = getRefusalFromResponse(response);
    if (refusal) {
      throw new Error('I had trouble understanding that. Mind entering a simpler value?');
    }

    const text = extractResponsesOutputText(response);

    if (this.debugLogsEnabled) {
      console.log('[PhysicalStatsService] raw response text:', text);
    }

    try {
      if (kind === 'age') {
        const parsed = parseModelJsonWithSchema(text, PhysicalStatsAgeSchema);
        return { ageYears: parsed.ageYears ?? undefined };
      }
      if (kind === 'height') {
        const parsed = parseModelJsonWithSchema(text, PhysicalStatsHeightSchema);
        return { heightCm: parsed.heightCm ?? undefined, unit: parsed.unit };
      }
      const parsed = parseModelJsonWithSchema(text, PhysicalStatsWeightSchema);
      return { weightKg: parsed.weightKg ?? undefined, unit: parsed.unit };
    } catch (error) {
      console.error('[PhysicalStatsService] Failed to parse JSON from response:', error);
      throw new Error('I had trouble understanding that. Mind entering a simpler value?');
    }
  }

  private buildPrompt(kind: 'age' | 'height' | 'weight', input: string): string {
    if (kind === 'age') {
      return [
        'You extract a user age from natural language input.',
        'Return ONLY a JSON object with this shape:',
        '{ "ageYears": number }',
        '',
        'Rules:',
        '- ageYears must be a whole number in years.',
        '- If you are not sure, or the input is ambiguous, choose null.',
        '',
        `User input: "${input}"`,
      ].join('\n');
    }

    if (kind === 'height') {
      return [
        'You extract a user height from natural language input.',
        'Return ONLY a JSON object with this shape:',
        '{ "heightCm": number, "unit": "cm" | "ft_in" }',
        '',
        'Rules:',
        '- Always convert the height to centimeters in heightCm.',
        '- If the user uses centimeters, set unit to "cm".',
        '- If the user uses feet/inches, set unit to "ft_in".',
        '- If you are not sure, choose null for heightCm.',
        '',
        `User input: "${input}"`,
      ].join('\n');
    }

    // weight
    return [
      'You extract a user weight from natural language input.',
      'Return ONLY a JSON object with this shape:',
      '{ "weightKg": number, "unit": "kg" | "lbs" }',
      '',
      'Rules:',
      '- Always convert the weight to kilograms in weightKg.',
      '- If the user uses kilograms, set unit to "kg".',
      '- If the user uses pounds, set unit to "lbs".',
      '- If you are not sure, choose null for weightKg.',
      '',
      `User input: "${input}"`,
    ].join('\n');
  }
}

