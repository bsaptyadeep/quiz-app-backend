import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Get topics for a quiz
 * GET /api/quizzes/:quizId/topics
 */
export async function getTopicsByQuizId(req: Request, res: Response) {
  try {
    const { quizId } = req.params;

    // Verify quiz exists
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Fetch topics for the quiz
    const topics = await prisma.topic.findMany({
      where: { quizId },
      select: {
        id: true,
        title: true,
        summary: true,
        level: true,
        tokenEstimate: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Add selected = true to all topics
    const topicsWithSelected = topics.map((topic) => ({
      ...topic,
      selected: true,
    }));

    return res.json({
      quizId,
      topics: topicsWithSelected,
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
}

