import { chromium, Browser, Page } from 'playwright';
import { prisma } from '../lib/prisma.js';
import { segmentContentByHeadings, normalizeTopics } from './topic-segmentation.service.js';
import { enrichTopic } from './topic-enrichment.service.js';
import { generateQuizForTopic, type Difficulty } from './topic-quiz-generator.service.js';
import type { MCQ } from './quiz-generator.service.js';

/**
 * Scrapes a website and returns HTML content
 * @param url - The URL of the website to scrape
 * @returns Promise<string> - The HTML content from the website
 * @throws Error if page fails to load or timeout occurs
 */
async function scrapeWebsiteHTML(url: string): Promise<string> {
  let browser: Browser | null = null;

  try {
    // Launch Chromium browser in headless mode
    browser = await chromium.launch({
      headless: true,
    });

    // Create a new page
    const page: Page = await browser.newPage();

    // Navigate to URL with 30 second timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000, // 30 seconds
    });

    // Wait for network to be idle to ensure page is fully loaded
    await page.waitForLoadState('networkidle');

    // Remove unwanted elements from the page
    await page.evaluate(() => {
      const selectorsToRemove = [
        'script',
        'style',
        'nav',
        'footer',
        'header',
        'iframe',
        'aside',
      ];

      const doc = (globalThis as any).document;
      selectorsToRemove.forEach((selector) => {
        const elements = doc.querySelectorAll(selector);
        elements.forEach((element: any) => element.remove());
      });
    });

    // Extract HTML content
    const html = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return doc.documentElement.outerHTML;
    });

    return html;
  } catch (error) {
    // Throw clear error if page fails to load
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('Navigation')) {
        throw new Error(`Failed to load page at ${url}: Page load timeout or navigation failed`);
      }
      throw new Error(`Failed to scrape website at ${url}: ${error.message}`);
    }
    throw new Error(`Failed to scrape website at ${url}: Unknown error occurred`);
  } finally {
    // Close browser safely in finally block to ensure cleanup even if errors occur
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Orchestrates the topic processing pipeline
 * @param quizId - The ID of the quiz to process topics for
 * @param sourceUrl - The URL of the website to process
 * @throws Error with meaningful message if any step fails
 */
export async function orchestrateQuiz(quizId: string, sourceUrl: string): Promise<void> {
  try {
    // Step 1: Scrape the website to get HTML
    const html = await scrapeWebsiteHTML(sourceUrl);

    // Step 2: Segment content into topics
    const rawTopics = segmentContentByHeadings(html, { quizId });

    if (rawTopics.length === 0) {
      throw new Error('No topics found in the scraped content');
    }

    // Step 3: Normalize topics
    const normalizedTopics = normalizeTopics(rawTopics);

    // Step 4: Enrich each topic independently (parallel)
    // Note: We enrich before creating topics, so topicId is not available yet
    const enrichedTopics = await Promise.all(
      normalizedTopics.map(async (topic) => {
        try {
          const enriched = await enrichTopic(
            {
              title: topic.title,
              content: topic.content,
            },
            { quizId } // topicId not available yet, will be logged after creation
          );
          return {
            ...topic,
            enrichedTitle: enriched.title,
            enrichedSummary: enriched.summary,
            importance: enriched.importance,
          };
        } catch (error) {
          // If enrichment fails for a topic, use original data
          console.error(`Failed to enrich topic "${topic.title}":`, error);
          return {
            ...topic,
            enrichedTitle: topic.title,
            enrichedSummary: topic.summary ? [topic.summary] : ['No summary available'],
            importance: 3, // Default importance
          };
        }
      })
    );

    // Step 5: Store topics in DB linked to quizId
    // Create topics sequentially to resolve parentId relationships
    const createdTopics: Array<{ id: string }> = [];
    
    for (let i = 0; i < enrichedTopics.length; i++) {
      const topic = enrichedTopics[i];
      
      // Resolve parentId from parentIndex
      let parentId: string | null = null;
      if (topic.parentIndex !== undefined && topic.parentIndex < i) {
        parentId = createdTopics[topic.parentIndex].id;
      }

      const created = await prisma.topic.create({
        data: {
          quizId,
          title: topic.enrichedTitle,
          summary: topic.enrichedSummary.join('\n'),
          level: topic.level,
          parentId,
          content: topic.content as any, // Prisma Json type
          tokenEstimate: topic.tokenEstimate,
          status: 'ready', // Topics are ready after enrichment
        },
      });

      createdTopics.push({ id: created.id });
    }

    // Step 6: Update quiz status to "processing_topics"
    // Quiz is now ready for user to select topics and generate questions via /generate endpoint
    await prisma.quiz.update({
      where: { id: quizId },
      data: {
        status: 'processing_topics',
      },
    });

    // Questions will only be generated when user calls POST /api/quizzes/:quizId/generate
    // with their selected topicIds
  } catch (error) {
    // Update quiz status to failed on error
    try {
      await prisma.quiz.update({
        where: { id: quizId },
        data: {
          status: 'failed',
        },
      });
    } catch (updateError) {
      console.error('Failed to update quiz status to failed:', updateError);
    }

    // Provide meaningful error messages based on the error
    if (error instanceof Error) {
      if (error.message.includes('Failed to load page') || error.message.includes('timeout')) {
        throw new Error(`Failed to scrape website at ${sourceUrl}: ${error.message}`);
      }
      if (error.message.includes('segment') || error.message.includes('topic')) {
        throw new Error(`Failed to process topics from ${sourceUrl}: ${error.message}`);
      }
      if (error.message.includes('enrich')) {
        throw new Error(`Failed to enrich topics: ${error.message}`);
      }
      throw new Error(`Topic processing failed for ${sourceUrl}: ${error.message}`);
    }
    throw new Error(`Topic processing failed for ${sourceUrl}: Unknown error occurred`);
  }
}

/**
 * Automatically generates quiz from all topics for a quiz
 * This is called internally after topics are processed
 * @param quizId - The ID of the quiz
 * @param difficulty - Difficulty level (default: medium)
 */
async function generateQuizAutomatically(quizId: string, difficulty: Difficulty = 'medium'): Promise<void> {
  try {
    // Check if quiz already has questions (client may have called /generate)
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        status: true,
        questions: true,
      },
    });

    if (!quiz) {
      throw new Error(`Quiz ${quizId} not found`);
    }

    // If quiz is already ready or has questions, skip auto-generation
    if (quiz.status === 'ready' || (quiz.questions && Array.isArray(quiz.questions) && (quiz.questions as any[]).length > 0)) {
      console.log(`Quiz ${quizId} already has questions, skipping auto-generation`);
      return;
    }

    // Get all topics for this quiz
    const topics = await prisma.topic.findMany({
      where: { quizId },
      select: {
        id: true,
        title: true,
        content: true,
      },
    });

    if (topics.length === 0) {
      console.log(`No topics found for quiz ${quizId}, skipping auto-generation`);
      return;
    }

    // Generate quizzes for each topic in parallel
    const questionPromises = topics.map(async (topic) => {
      try {
        // Topic content is stored as Json, convert to string array
        const content = Array.isArray(topic.content)
          ? (topic.content as string[])
          : typeof topic.content === 'string'
          ? [topic.content]
          : [];

        const questions = await generateQuizForTopic(
          {
            title: topic.title,
            content: content,
          },
          difficulty,
          { quizId, topicId: topic.id }
        );

        return questions;
      } catch (error) {
        console.error(`Failed to generate quiz for topic ${topic.id}:`, error);
        // Return empty array if generation fails for a topic
        return [];
      }
    });

    // Wait for all topic quizzes to be generated
    const allQuestionArrays = await Promise.all(questionPromises);

    // Merge all questions into a single array
    const allQuestions: MCQ[] = allQuestionArrays.flat();

    if (allQuestions.length === 0) {
      console.error(`Failed to generate any questions for quiz ${quizId}`);
      return;
    }

    // Shuffle questions using Fisher-Yates algorithm
    const shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Cap to 10 questions
    const finalQuestions = shuffled.slice(0, 10);

    // Double-check quiz still doesn't have questions (race condition check)
    const updatedQuiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        status: true,
        questions: true,
      },
    });

    if (updatedQuiz && updatedQuiz.status === 'ready' && updatedQuiz.questions && Array.isArray(updatedQuiz.questions) && (updatedQuiz.questions as any[]).length > 0) {
      console.log(`Quiz ${quizId} was already generated by client, skipping auto-generation`);
      return;
    }

    // Save questions to Quiz.questions and update status to "ready"
    await prisma.quiz.update({
      where: { id: quizId },
      data: {
        questions: finalQuestions as any, // Prisma Json type
        status: 'ready',
      },
    });

    console.log(`Auto-generated ${finalQuestions.length} questions for quiz ${quizId}`);
  } catch (error) {
    console.error(`Error in auto-generate quiz for ${quizId}:`, error);
    // Don't throw - this is a background process
  }
}

