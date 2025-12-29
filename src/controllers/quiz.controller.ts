import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { orchestrateQuiz } from '../services/agent-orchestrator.service.js';
import { generateQuizForTopic, type Difficulty } from '../services/topic-quiz-generator.service.js';
import type { MCQ } from '../services/quiz-generator.service.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

/**
 * Submit quiz answers and get score
 * POST /api/quizzes/:id/submit
 */
export async function submitQuiz(req: Request, res: Response) {
  try {
    const { quizId } = req.params;
    const { answers } = req.body; // Array of answer indices: [0, 2, 1, ...]

    if (!quizId) {
      return res.status(400).json({ error: 'Quiz ID is required' });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'Answers must be an array' });
    }

    // Fetch quiz from database
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Check if user owns this quiz
    const authReq = req as AuthRequest;
    if (authReq.auth?.userId !== quiz.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (quiz.status !== 'ready') {
      return res.status(400).json({ error: `Quiz is not ready. Current status: ${quiz.status}` });
    }

    // Get questions with correct answers
    const questions = quiz.questions as unknown as MCQ[];

    if (answers.length !== questions.length) {
      return res.status(400).json({ 
        error: `Number of answers (${answers.length}) does not match number of questions (${questions.length})` 
      });
    }

    // Validate all answers are valid indices
    for (let i = 0; i < answers.length; i++) {
      if (typeof answers[i] !== 'number' || answers[i] < 0 || answers[i] > 3) {
        return res.status(400).json({ 
          error: `Invalid answer at index ${i}. Must be a number between 0 and 3` 
        });
      }
    }

    // Calculate score
    let correctCount = 0;
    const results = questions.map((question, index) => {
      const isCorrect = answers[index] === question.answerIndex;
      if (isCorrect) correctCount++;
      return {
        questionIndex: index,
        correct: isCorrect,
        correctAnswerIndex: question.answerIndex,
        userAnswerIndex: answers[index],
      };
    });

    const totalQuestions = questions.length;
    const score = Math.round((correctCount / totalQuestions) * 100);

    // Return results
    return res.json({
      quizId: quiz.id,
      score,
      correctCount,
      totalQuestions,
      percentage: score,
      results,
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return res.status(500).json({ error: 'Failed to submit quiz' });
  }
}

/**
 * Create a new quiz from a source URL
 * POST /api/quizzes
 * Creates quiz asynchronously and returns immediately with processing status
 */
export async function createQuiz(req: Request, res: Response) {
  try {
    const { source_url } = req.body;
    const authReq = req as AuthRequest;

    // Auth middleware ensures userId is present, but add safety check
    if (!authReq.auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Create quiz record with processing status
    // Provide empty questions array initially for processing status
    const savedQuiz = await prisma.quiz.create({
      data: {
        userId: authReq.auth.userId,
        sourceUrl: source_url,
        status: 'processing',
        questions: [], // Empty array as placeholder during processing
      },
    });

    // Start async topic processing (don't await)
    orchestrateQuiz(savedQuiz.id, source_url).catch(async (error) => {
      console.error('Error processing topics:', error);
      // Update quiz status to failed
      await prisma.quiz.update({
        where: { id: savedQuiz.id },
        data: {
          status: 'failed',
        },
      });
    });

    // Return quiz_id immediately
    return res.status(201).json({ 
      quiz_id: savedQuiz.id,
      status: 'processing',
      message: 'Quiz is being generated. Poll the quiz endpoint to check status.',
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    return res.status(500).json({ error: 'Failed to create quiz' });
  }
}

/**
 * Get a quiz by ID
 * GET /api/quizzes/:id
 */
export async function getQuizById(req: Request, res: Response) {
  try {
    const { quizId } = req.params;

    if (!quizId) {
      return res.status(400).json({ error: 'Quiz ID is required' });
    }

    // Fetch quiz from database
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Check if user owns this quiz
    const authReq = req as AuthRequest;
    if (authReq.auth?.userId !== quiz.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Remove answerIndex from questions before response
    // If quiz is still processing or failed, don't include questions
    const questions = quiz.questions as unknown as MCQ[];
    const hasQuestions = Array.isArray(questions) && questions.length > 0;
    const questionsWithoutAnswers = hasQuestions 
      ? questions.map(({ answerIndex, ...question }) => question)
      : [];
    
    return res.json({
      id: quiz.id,
      sourceUrl: quiz.sourceUrl,
      title: quiz.title,
      questions: (quiz.status === 'ready' && hasQuestions) ? questionsWithoutAnswers : null,
      status: quiz.status,
      createdAt: quiz.createdAt,
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    return res.status(500).json({ error: 'Failed to fetch quiz' });
  }
}

/**
 * Generate quiz from selected topics
 * POST /api/quizzes/:quizId/generate
 */
export async function generateQuizFromTopics(req: Request, res: Response) {
  try {
    const { quizId } = req.params;
    const { topicIds, difficulty } = req.body;

    // Verify quiz exists
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Validate that all topicIds belong to this quiz
    const topics = await prisma.topic.findMany({
      where: {
        id: { in: topicIds },
        quizId: quizId,
      },
      select: {
        id: true,
        title: true,
        content: true,
      },
    });

    // Check if all requested topics were found
    if (topics.length !== topicIds.length) {
      const foundIds = topics.map((t) => t.id);
      const missingIds = topicIds.filter((id: string) => !foundIds.includes(id));
      return res.status(400).json({
        error: 'Some topic IDs do not belong to this quiz',
        missingTopicIds: missingIds,
      });
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
          difficulty as Difficulty,
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
      return res.status(500).json({ error: 'Failed to generate any questions from the selected topics' });
    }

    // Shuffle questions using Fisher-Yates algorithm
    const shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Cap to 10 questions
    const finalQuestions = shuffled.slice(0, 10);

    // Save questions to Quiz.questions and update status to "ready"
    await prisma.quiz.update({
      where: { id: quizId },
      data: {
        questions: finalQuestions as any, // Prisma Json type
        status: 'ready',
      },
    });

    return res.json({
      quizId,
      status: 'ready',
      questionCount: finalQuestions.length,
      message: `Successfully generated ${finalQuestions.length} questions from ${topics.length} topic(s)`,
    });
  } catch (error) {
    console.error('Error generating quiz from topics:', error);
    return res.status(500).json({ error: 'Failed to generate quiz from topics' });
  }
}

