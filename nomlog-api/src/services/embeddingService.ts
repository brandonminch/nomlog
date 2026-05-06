import OpenAI from 'openai';

export class EmbeddingService {
  private client: OpenAI;
  private model: string = 'text-embedding-3-small';
  private dimensions: number = 1536;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.client = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding for meal text by combining name, description, and original_description
   * @param name - Meal name (may be null)
   * @param description - LLM-generated description (may be null)
   * @param originalDescription - User's original input (may be null)
   * @returns Embedding vector as array of numbers
   */
  async generateEmbedding(
    name: string | null,
    description: string | null,
    originalDescription: string | null
  ): Promise<number[]> {
    // Combine all fields with null handling
    const parts: string[] = [];
    
    if (name) {
      parts.push(name.trim());
    }
    
    if (description) {
      parts.push(description.trim());
    }
    
    if (originalDescription) {
      parts.push(originalDescription.trim());
    }

    // If all fields are null/empty, throw error
    if (parts.length === 0) {
      throw new Error('Cannot generate embedding: all meal text fields are empty');
    }

    // Combine parts with spaces
    const combinedText = parts.join(' ');

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: combinedText,
        dimensions: this.dimensions,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embedding for a search query
   * @param query - Search query text
   * @returns Embedding vector as array of numbers
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query text cannot be empty');
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: query.trim(),
        dimensions: this.dimensions,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating query embedding:', error);
      throw new Error(`Failed to generate query embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

