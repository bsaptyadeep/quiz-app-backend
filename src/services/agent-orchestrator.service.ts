import { scrapeWebsite } from './scrape.service.js';
import { condenseContent } from './content.service.js';
import { generateQuiz, type Quiz } from './quiz-generator.service.js';

/**
 * Orchestrates the quiz generation pipeline
 * @param sourceUrl - The URL of the website to generate quiz from
 * @returns Promise<Quiz> - Final quiz payload
 * @throws Error with meaningful message if any step fails
 */
export async function orchestrateQuiz(sourceUrl: string): Promise<Quiz> {
  try {
    // Step 1: Scrape the website to get cleaned text
    const cleanedText = await scrapeWebsite(sourceUrl);

    // Step 2: Condense the content into key points
    const keyPoints = await condenseContent(cleanedText);

    // Step 3: Generate quiz from key points
    const quiz = await generateQuiz(keyPoints);

    // Return the final quiz payload
    return quiz;
  } catch (error) {
    // Provide meaningful error messages based on the error
    if (error instanceof Error) {
      if (error.message.includes('Failed to load page') || error.message.includes('timeout')) {
        throw new Error(`Failed to scrape website at ${sourceUrl}: ${error.message}`);
      }
      if (error.message.includes('condense') || error.message.includes('content')) {
        throw new Error(`Failed to condense content from ${sourceUrl}: ${error.message}`);
      }
      if (error.message.includes('generate') || error.message.includes('quiz')) {
        throw new Error(`Failed to generate quiz from content: ${error.message}`);
      }
      throw new Error(`Quiz generation failed for ${sourceUrl}: ${error.message}`);
    }
    throw new Error(`Quiz generation failed for ${sourceUrl}: Unknown error occurred`);
  }
}

