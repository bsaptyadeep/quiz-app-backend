import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Builds OpenAI-compatible messages array for content condensation
 * @param scrapedText - The scraped text content to condense
 * @returns Array of message objects for OpenAI API
 */
export function buildCondenserMessages(
  scrapedText: string
): ChatCompletionMessageParam[] {
  const systemPrompt = `You are a content condenser that extracts key facts and important information from text.
Your task is to analyze the provided text and extract only factual, important points.
Focus on:
- Main concepts and ideas
- Important details and supporting information
- Key insights and takeaways
- Factual information only (no opinions or speculation)

Return your response as a JSON array of strings, where each string is a concise key point.
Each key point should be a complete, standalone fact or concept.
Keep key points clear, specific, and informative.`;

  const userPrompt = `Please extract the key facts and important information from the following text:

${scrapedText}

Return the key points as a JSON array of strings.`;

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];
}

