import express from 'express';
import { getTopicsByQuizId } from '../controllers/topic.controller.js';
import { validate, quizIdSchema } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /api/quizzes/{quizId}/topics:
 *   get:
 *     summary: Get topics for a quiz
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the quiz to get topics for
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quizId:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 topics:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "123e4567-e89b-12d3-a456-426614174000"
 *                       title:
 *                         type: string
 *                         example: "Introduction to Machine Learning"
 *                       summary:
 *                         type: string
 *                         nullable: true
 *                         example: "Overview of ML concepts and applications"
 *                       level:
 *                         type: integer
 *                         example: 1
 *                       tokenEstimate:
 *                         type: integer
 *                         example: 1500
 *                       selected:
 *                         type: boolean
 *                         example: true
 *       404:
 *         description: Quiz not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Quiz not found"
 *       400:
 *         description: Bad request - Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Validation failed"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                         example: "quizId"
 *                       message:
 *                         type: string
 *                         example: "Quiz ID must be a valid UUID"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch topics"
 */
router.get(
  '/:quizId/topics',
  validate(undefined, { paramsSchema: quizIdSchema }),
  asyncHandler(getTopicsByQuizId)
);

export default router;

