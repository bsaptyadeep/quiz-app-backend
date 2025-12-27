import { z } from 'zod';
import { callLLM } from '../lib/llm.js';
import { buildTopicEnrichmentMessages } from '../prompts/topic-enrichment.prompt.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Zod schema for enriched topic validation
 */
const enrichedTopicSchema = z.object({
  title: z.string().min(1, 'Title must be a non-empty string'),
  summary: z
    .array(z.string().min(1, 'Summary bullet points must be non-empty strings'))
    .min(2, 'Summary must have at least 2 bullet points')
    .max(3, 'Summary must have at most 3 bullet points'),
  importance: z
    .number()
    .int('Importance must be an integer')
    .min(1, 'Importance must be at least 1')
    .max(5, 'Importance must be at most 5'),
});

/**
 * Enriched topic data
 */
export type EnrichedTopic = z.infer<typeof enrichedTopicSchema>;

/**
 * Topic input for enrichment
 */
type TopicInput = {
  title: string;
  content: string[];
};

/**
 * Enriches a topic by rewriting title, generating summary, and estimating importance
 * @param topic - Topic with title and content
 * @param metadata - Optional metadata for logging (quizId, topicId)
 * @returns Promise<EnrichedTopic> - Enriched topic with rewritten title, summary, and importance
 * @throws Error if OpenAI API call fails or JSON parsing fails after retries
 */
export async function enrichTopic(
  topic: TopicInput,
  metadata?: { quizId?: string; topicId?: string }
): Promise<EnrichedTopic> {
  const startTime = Date.now();
  const contentLength = topic.content.join(' ').length;
  const tokenEstimate = Math.ceil((topic.title.length + contentLength) / 4); // ~4 chars per token

  // Build messages using system + user prompt
  const messages = buildTopicEnrichmentMessages(topic.title, topic.content);

  // Retry up to 3 times on JSON parse or validation failure
  return retryWithBackoff(async () => {
    // Call OpenAI API
    const response = await callLLM(messages);

    // Parse JSON safely
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = response.trim().replace(/^```json\s*|\s*```$/g, '').trim();
      
      // Parse the JSON object
      const parsed = JSON.parse(cleanedResponse);

      // Validate with Zod schema
      const enriched = enrichedTopicSchema.parse(parsed);

      // Additional validation: title word count (≤6 words)
      const titleWords = enriched.title.trim().split(/\s+/).filter((w) => w.length > 0);
      if (titleWords.length > 6) {
        throw new Error(`Title has ${titleWords.length} words, must be ≤6 words`);
      }

      // Trim and return validated data
      const result = {
        title: enriched.title.trim(),
        summary: enriched.summary.map((bullet) => bullet.trim()),
        importance: enriched.importance,
      };

      const elapsedTime = Date.now() - startTime;

      // Structured logging
      console.log(JSON.stringify({
        event: 'topic_enrichment_complete',
        quizId: metadata?.quizId || null,
        topicId: metadata?.topicId || null,
        elapsedTimeMs: elapsedTime,
        tokenEstimate,
        timestamp: new Date().toISOString(),
      }));

      return result;
    } catch (error) {
      // Throw error if parsing fails (will trigger retry)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse JSON response from OpenAI: ${error.message}`);
      }
      if (error instanceof z.ZodError) {
        // Format Zod validation errors into a descriptive message
        const errorMessages = error.errors.map((err) => {
          const path = err.path.join('.');
          return path ? `${path}: ${err.message}` : err.message;
        });
        throw new Error(`Topic enrichment validation failed: ${errorMessages.join('; ')}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to enrich topic: ${error.message}`);
      }
      throw new Error('Failed to enrich topic: Unknown error occurred');
    }
  }, 3);
}

