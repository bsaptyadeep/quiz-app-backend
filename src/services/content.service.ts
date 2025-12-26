import { callLLM } from '../lib/llm.js';
import { buildCondenserMessages } from '../prompts/index.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Condenses content into key points
 * @param text - The text content to condense
 * @returns Promise<string[]> - Array of key points extracted from the content
 * @throws Error if OpenAI API call fails or JSON parsing fails after retries
 */
export async function condenseContent(text: string): Promise<string[]> {
  // Build messages using system + user prompt
  const messages = buildCondenserMessages(text);

  // Retry up to 3 times on JSON parse or validation failure
  return retryWithBackoff(async () => {
    // Call OpenAI API
    const response = await callLLM(messages);

    // Parse JSON safely
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = response.trim().replace(/^```json\s*|\s*```$/g, '').trim();
      
      // Parse the JSON array
      const keyPoints = JSON.parse(cleanedResponse) as string[];

      // Validate that it's an array of strings
      if (!Array.isArray(keyPoints)) {
        throw new Error('Response is not an array');
      }

      if (!keyPoints.every((point) => typeof point === 'string')) {
        throw new Error('Response contains non-string elements');
      }

      return keyPoints;
    } catch (error) {
      // Throw error if parsing fails (will trigger retry)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse JSON response from OpenAI: ${error.message}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to process key points: ${error.message}`);
      }
      throw new Error('Failed to parse key points from OpenAI response');
    }
  }, 3);
}

