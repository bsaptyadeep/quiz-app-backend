import OpenAI from 'openai';

// Initialize OpenAI client with API key from environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Calls the OpenAI API with messages and returns the raw text response
 * @param messages - Array of message objects for the chat completion
 * @returns Promise<string> - The raw text content from the assistant's response
 * @throws Error if API key is missing or API call fails
 */
export async function callLLM(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<string> {
  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Call OpenAI API
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
  });

  // Extract and return the raw text content from the response
  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content received from OpenAI API');
  }

  return content;
}

