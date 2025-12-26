import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { orchestrateQuiz } from '../services/agent-orchestrator.service.js';
import type { MCQ } from '../services/quiz-generator.service.js';

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

    // Create quiz record with processing status
    // Provide empty questions array initially for processing status
    const savedQuiz = await prisma.quiz.create({
      data: {
        sourceUrl: source_url,
        status: 'processing',
        questions: [], // Empty array as placeholder during processing
      },
    });

    // Start async quiz generation (don't await)
    orchestrateQuiz(source_url)
      .then(async (quiz) => {
        // Update quiz with generated data
        await prisma.quiz.update({
          where: { id: savedQuiz.id },
          data: {
            title: quiz.title,
            questions: quiz.questions as any, // Prisma Json type
            status: 'ready',
          },
        });
      })
      .catch(async (error) => {
        console.error('Error generating quiz:', error);
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

