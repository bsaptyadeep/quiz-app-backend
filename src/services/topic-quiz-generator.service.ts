import { z } from 'zod';
import { callLLM } from '../lib/llm.js';
import { buildTopicQuizGeneratorMessages } from '../prompts/topic-quiz-generator.prompt.js';
import { retryWithBackoff } from '../utils/retry.js';
import type { MCQ } from './quiz-generator.service.js';

/**
 * Zod schema for topic quiz response validation
 */
const topicQuizResponseSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1, 'Question text must not be empty'),
        options: z
          .array(z.string().min(1, 'Option text must not be empty'))
          .length(4, 'Each question must have exactly 4 options'),
        answerIndex: z
          .number()
          .int('Answer index must be an integer')
          .min(0, 'Answer index must be at least 0')
          .max(3, 'Answer index must be at most 3'),
      })
    )
    .min(2, 'Must have at least 2 questions')
    .max(4, 'Must have at most 4 questions'),
});

/**
 * Topic input for quiz generation
 */
type TopicInput = {
  title: string;
  content: string[];
};

/**
 * Difficulty levels for quiz generation
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Generates quiz questions for a single topic
 * @param topic - Topic with title and content
 * @param difficulty - Difficulty level (easy, medium, hard)
 * @param metadata - Optional metadata for logging (quizId, topicId)
 * @returns Promise<MCQ[]> - Array of validated multiple choice questions
 * @throws Error if OpenAI API call fails, JSON parsing fails, or validation fails after retries
 */
export async function generateQuizForTopic(
  topic: TopicInput,
  difficulty: Difficulty = 'medium',
  metadata?: { quizId?: string; topicId?: string }
): Promise<MCQ[]> {
  const startTime = Date.now();
  
  // Determine question count (2-4 questions)
  // Use topic content length to determine appropriate count
  const contentLength = topic.content.join(' ').length;
  let questionCount = 3; // Default to 3 questions
  
  if (contentLength < 500) {
    questionCount = 2; // Short content: 2 questions
  } else if (contentLength > 2000) {
    questionCount = 4; // Long content: 4 questions
  }

  // Build messages using system + user prompt
  const messages = buildTopicQuizGeneratorMessages(
    topic.content,
    topic.title,
    difficulty,
    questionCount
  );

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
      const validated = topicQuizResponseSchema.parse(parsed);

      // Additional validation: ensure answerIndex is valid for each question
      const validatedQuestions: MCQ[] = validated.questions.map((q, index) => {
        // Double-check answerIndex is within bounds
        if (q.answerIndex < 0 || q.answerIndex > 3) {
          throw new Error(
            `Question ${index + 1} answerIndex ${q.answerIndex} is out of bounds (must be 0-3)`
          );
        }

        // Ensure answerIndex is an integer
        if (!Number.isInteger(q.answerIndex)) {
          throw new Error(`Question ${index + 1} answerIndex must be an integer`);
        }

        // Ensure all options are non-empty strings
        if (!q.options.every((opt) => typeof opt === 'string' && opt.trim().length > 0)) {
          throw new Error(`Question ${index + 1} has empty or invalid options`);
        }

        return {
          question: q.question.trim(),
          options: q.options.map((opt) => opt.trim()),
          answerIndex: q.answerIndex,
        };
      });

      const elapsedTime = Date.now() - startTime;
      const tokenEstimate = Math.ceil((topic.title.length + contentLength) / 4); // ~4 chars per token

      // Structured logging
      console.log(JSON.stringify({
        event: 'topic_quiz_generation_complete',
        quizId: metadata?.quizId || null,
        topicId: metadata?.topicId || null,
        questionCount: validatedQuestions.length,
        difficulty,
        elapsedTimeMs: elapsedTime,
        tokenEstimate,
        timestamp: new Date().toISOString(),
      }));

      return validatedQuestions;
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
        throw new Error(`Topic quiz validation failed: ${errorMessages.join('; ')}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to generate quiz for topic: ${error.message}`);
      }
      throw new Error('Failed to generate quiz for topic: Unknown error occurred');
    }
  }, 3);
}

