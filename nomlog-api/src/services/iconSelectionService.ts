import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId, type LlmOwnerContext } from '../ai/openaiResponses';

/**
 * List of all available Lucide food & beverage icons (main library, excluding lab icons)
 * These are the icons available in lucide-react-native
 */
const AVAILABLE_ICONS = [
  // Fruits & Vegetables
  'apple',
  'banana',
  'carrot',
  'cherry',
  'citrus',
  'grape',
  'leafy-green',
  
  // Meat & Protein
  'beef',
  'drumstick',
  'egg',
  'egg-fried',
  'fish',
  'fish-symbol',
  'ham',
  'nut',
  
  // Baked Goods & Desserts
  'cake',
  'cake-slice',
  'candy',
  'candy-cane',
  'cookie',
  'croissant',
  'donut',
  'dessert',
  'ice-cream-bowl',
  'ice-cream-cone',
  'lollipop',
  
  // Beverages
  'beer',
  'beer-off',
  'bottle-wine',
  'coffee',
  'cup-soda',
  'glass-water',
  'martini',
  'milk',
  'milk-off',
  'wine',
  'wine-off',
  
  // Cooking & Food Preparation
  'chef-hat',
  'cooking-pot',
  'hand-platter',
  'microwave',
  'utensils',
  'utensils-crossed',
  
  // Prepared Foods & Meals
  'hamburger',
  'pizza',
  'salad',
  'sandwich',
  'soup',
  'wheat',
  
  // Containers & Storage
  'amphora',
  'barrel',
  
  // Other Food Items
  'bean',
  'popcorn',
  
  // "Off" Variants
  'bean-off',
  'candy-off',
  'egg-off',
  'fish-off',
  'hop-off',
  'nut-off',
  
  // Additional
  'hop',
] as const;

const DEFAULT_ICON = 'utensils';

export class IconSelectionService {
  private client: OpenAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.modelName = process.env.OPENAI_MODEL_NAME || 'gpt-5-mini';
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Select the best matching Lucide icon for a meal based on its name/title
   * @param mealName - The name/title of the meal (primary input, may be null)
   * @param mealDescription - The description of the meal (fallback if name is not available)
   * @returns The icon name in kebab-case format (e.g., "pizza", "coffee", "utensils")
   */
  async selectIcon(
    mealName: string | null,
    mealDescription: string,
    llm?: LlmOwnerContext
  ): Promise<string> {
    try {
      // Use meal name as primary input, fallback to description if name is not available
      const primaryInput = mealName || mealDescription;
      const prompt = this.buildPrompt(primaryInput);
      const iconName = await this.generateIconSelection(prompt, llm);
      
      // Validate the icon name - MUST be from our predefined list
      if (this.isValidIcon(iconName)) {
        console.log(`[IconSelectionService] Selected icon: ${iconName} for meal: ${mealName || 'unnamed'}`);
        return iconName;
      } else {
        console.warn(`[IconSelectionService] Invalid icon name returned: ${iconName}, falling back to ${DEFAULT_ICON}`);
        return DEFAULT_ICON;
      }
    } catch (error) {
      console.error('[IconSelectionService] Error selecting icon:', error);
      return DEFAULT_ICON;
    }
  }

  private buildPrompt(mealText: string): string {
    const iconList = AVAILABLE_ICONS.join(', ');

    return `You are selecting the best Lucide icon to represent a meal. 

Meal: ${mealText}

CRITICAL: You MUST select ONLY from this exact list of available icons (kebab-case format):
${iconList}

Instructions:
1. You MUST select the SINGLE best matching icon from the EXACT list above - no other icons are allowed
2. Consider the primary food item, meal type, or most prominent ingredient in the meal name
3. Return ONLY the icon name in kebab-case format (e.g., "pizza", "coffee", "hamburger")
4. Do not include any explanation, just the icon name
5. If no icon perfectly matches, choose the closest general match (e.g., "utensils" for generic meals)
6. The icon name MUST exactly match one of the icons in the list above

Examples:
- "Pepperoni Pizza" → "pizza"
- "Coffee" → "coffee"
- "Grilled Chicken Breast" → "drumstick"
- "Greek Salad" → "salad"
- "Chocolate Chip Cookies" → "cookie"
- "Scrambled Eggs" → "egg-fried"
- "Chicken Soup" → "soup"
- "Tacos" → "utensils" (since "taco" is not in the list)
- "Generic Meal" → "utensils"

Generic Fallbacks:
- Soda/iced latte/togo beverage etc → "cup-soda"
- Cold beverage → "glass-water"

Return only the icon name from the list above:`;
  }

  private async generateIconSelection(prompt: string, llm?: LlmOwnerContext): Promise<string> {
    const payload: any = {
      model: this.modelName,
      input: prompt,
      temperature: 0,
      max_output_tokens: 100,
      reasoning: { effort: 'low' },
    };

    const requestGroupId = newLlmRequestGroupId();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await createTrackedOpenAIResponse(this.client, payload, {
          userId: llm?.userId ?? null,
          route: llm?.route ?? null,
          tag: 'openai_icon_selection',
          requestGroupId,
          attemptIndex: attempt,
        });
        
        if (response.status === 'incomplete') {
          console.log('[IconSelectionService] Response incomplete, retrying...');
          continue;
        }
        
        const text = (response as any).output_text
          || (response as any).output?.[0]?.content?.[0]?.text
          || '';
        
        // Extract icon name from response (remove any whitespace, quotes, or markdown)
        const iconName = text.trim()
          .replace(/^["']|["']$/g, '') // Remove surrounding quotes
          .replace(/^`|`$/g, '') // Remove code backticks
          .toLowerCase();
        
        return iconName;
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        const message: string = (err?.message || err?.response?.data?.error?.message || '').toString();
        
        if (status !== 400) throw err;
        
        // Handle unsupported parameters
        if (/reasoning\.effort|Unsupported parameter: 'reasoning\.effort'/i.test(message) && payload.reasoning) {
          delete payload.reasoning;
          continue;
        }
        if (/Unsupported parameter: 'temperature'/i.test(message) && Object.prototype.hasOwnProperty.call(payload, 'temperature')) {
          delete payload.temperature;
          continue;
        }
        if (/Unsupported parameter: 'max_output_tokens'/i.test(message) && Object.prototype.hasOwnProperty.call(payload, 'max_output_tokens')) {
          delete payload.max_output_tokens;
          continue;
        }
        
        throw err;
      }
    }
    
    throw new Error('Failed to generate icon selection after retries');
  }

  private isValidIcon(iconName: string): boolean {
    return AVAILABLE_ICONS.includes(iconName as any);
  }
}
