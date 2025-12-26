import { callLLM } from '../lib/llm.js';
import { buildQuizGeneratorMessages } from '../prompts/index.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Generates a quiz from key points
 * @param keyPoints - Array of key points to generate quiz questions from
 * @returns Promise<{ title: string; questions: MCQ[] }> - Quiz object with title and multiple choice questions
 * @throws Error if OpenAI API call fails, JSON parsing fails, or validation fails after retries
 */

export interface MCQ {
  question: string;
  options: string[];
  answerIndex: number; // Index of the correct answer in options array
}

export interface Quiz {
  title: string;
  questions: MCQ[];
}

export async function generateQuiz(keyPoints: string[]): Promise<Quiz> {
  // Convert key points array to JSON string
  const keyPointsJson = JSON.stringify(keyPoints);

  // Build messages using strict system and user prompts
  const messages = buildQuizGeneratorMessages(keyPointsJson);

  // Retry up to 3 times on JSON parse or validation failure
  return retryWithBackoff(async () => {
    // Call OpenAI API
    const response = await callLLM(messages);

    // Parse JSON response
    let quiz: Quiz;
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = response.trim().replace(/^```json\s*|\s*```$/g, '').trim();
      
      // Parse the JSON
      quiz = JSON.parse(cleanedResponse) as Quiz;

      

      // Normalize answerIndex: convert string numbers, null, undefined to actual numbers
      if (quiz.questions && Array.isArray(quiz.questions)) {
        quiz.questions = quiz.questions.map((q, index) => {
          if (!q) return q;
          
          // Handle different types of answerIndex
          if (q.answerIndex === null || q.answerIndex === undefined) {
            console.warn(`Question ${index + 1}: answerIndex is null/undefined, defaulting to 0`);
            return { ...q, answerIndex: 0 };
          }
          
          // If it's already a number, ensure it's an integer
          if (typeof q.answerIndex === 'number') {
            return { ...q, answerIndex: Math.floor(q.answerIndex) };
          }
          
          // If it's a string, try to parse it
          const answerIndexValue = q.answerIndex as unknown;
          if (typeof answerIndexValue === 'string') {
            const num = parseInt(answerIndexValue.trim(), 10);
            if (!isNaN(num)) {
              return { ...q, answerIndex: num };
            }
            console.warn(`Question ${index + 1}: answerIndex string "${answerIndexValue}" could not be parsed as number`);
          }
          
          // If we get here, the type is unexpected
          console.warn(`Question ${index + 1}: answerIndex has unexpected type: ${typeof q.answerIndex}, value: ${q.answerIndex}`);
          return q;
        });
      }
      
    } catch (error) {
      // Throw error if parsing fails (will trigger retry)
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse JSON response from OpenAI: ${error.message}`);
      }
      throw new Error(`Failed to parse quiz from OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate output (validation errors will trigger retry)
    // Check if title exists
    if (!quiz.title || typeof quiz.title !== 'string' || quiz.title.trim().length === 0) {
      throw new Error('Quiz title is missing or invalid');
    }

    // Check if questions array exists and has correct length
    if (!Array.isArray(quiz.questions)) {
      throw new Error('Quiz questions must be an array');
    }

    if (quiz.questions.length < 5 || quiz.questions.length > 10) {
      throw new Error(`Quiz must have between 5 and 10 questions, got ${quiz.questions.length}`);
    }

    // Validate each question
    for (let i = 0; i < quiz.questions.length; i++) {
      const question = quiz.questions[i];

      if (!question || typeof question !== 'object') {
        throw new Error(`Question ${i + 1} is invalid or missing`);
      }

      if (!question.question || typeof question.question !== 'string') {
        throw new Error(`Question ${i + 1} text is missing or invalid`);
      }

      // Check if options array exists and has exactly 4 options
      if (!Array.isArray(question.options)) {
        throw new Error(`Question ${i + 1} options must be an array`);
      }

      if (question.options.length !== 4) {
        throw new Error(`Question ${i + 1} must have exactly 4 options, got ${question.options.length}`);
      }

      // Validate all options are strings
      if (!question.options.every((opt) => typeof opt === 'string' && opt.trim().length > 0)) {
        throw new Error(`Question ${i + 1} options must all be non-empty strings`);
      }

      // Check if answerIndex is between 0 and 3
      // Final attempt to convert if still not a number
      let answerIndex = question.answerIndex as unknown;
      if (typeof answerIndex !== 'number') {
        // Try one more conversion attempt
        if (typeof answerIndex === 'string') {
          const num = parseInt(answerIndex.trim(), 10);
          if (!isNaN(num)) {
            answerIndex = num;
            question.answerIndex = num;
          }
        }
        
        // If still not a number, throw error
        if (typeof answerIndex !== 'number') {
          throw new Error(
            `Question ${i + 1} answerIndex must be a number, got ${typeof question.answerIndex} with value: ${JSON.stringify(question.answerIndex)}`
          );
        }
      }

      if (question.answerIndex < 0 || question.answerIndex > 3) {
        throw new Error(`Question ${i + 1} answerIndex must be between 0 and 3, got ${question.answerIndex}`);
      }

      // Validate that answerIndex is an integer
      if (!Number.isInteger(question.answerIndex)) {
        throw new Error(`Question ${i + 1} answerIndex must be an integer`);
      }
    }

    return quiz;
  }, 3);
}

