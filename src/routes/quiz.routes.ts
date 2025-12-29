import express from 'express';
import { createQuiz, getQuizById, submitQuiz, generateQuizFromTopics } from '../controllers/quiz.controller.js';
import { validate, createQuizSchema, submitQuizSchema, quizIdSchema, generateQuizSchema } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createQuizLimiter } from '../middleware/rate-limit.middleware.js';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

const router = express.Router();

/**
 * @swagger
 * /api/quizzes:
 *   post:
 *     summary: Create a new quiz from a source URL
 *     description: >
 *       This endpoint scrapes public web pages only.
 *       Paywalled or login-protected sites may fail.
 *     tags: [Quizzes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - source_url
 *             properties:
 *               source_url:
 *                 type: string
 *                 description: The URL of the website to generate quiz from
 *                 example: https://example.com/article
 *     responses:
 *       201:
 *         description: Quiz created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quiz_id:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
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
 *                         example: "source_url"
 *                       message:
 *                         type: string
 *                         example: "source_url must be a valid URL"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create quiz"
 */
router.post('/', createQuizLimiter, ClerkExpressRequireAuth(), validate(createQuizSchema), asyncHandler(createQuiz));

/**
 * @swagger
 * /api/quizzes/{quizId}:
 *   get:
 *     summary: Get a quiz by ID
 *     tags: [Quizzes]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the quiz to retrieve
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Quiz retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 sourceUrl:
 *                   type: string
 *                   example: "https://example.com/article"
 *                 title:
 *                   type: string
 *                   nullable: true
 *                   example: "Generated Quiz from Content"
 *                 questions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       question:
 *                         type: string
 *                         example: "What is the main concept discussed in the content?"
 *                       options:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["Option 1", "Option 2", "Option 3", "Option 4"]
 *                 status:
 *                   type: string
 *                   example: "ready"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T00:00:00.000Z"
 *       400:
 *         description: Bad request - Quiz ID is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Quiz ID is required"
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch quiz"
 */
router.get('/:quizId', ClerkExpressRequireAuth(), validate(undefined, { paramsSchema: quizIdSchema }), asyncHandler(getQuizById));

/**
 * @swagger
 * /api/quizzes/{quizId}/submit:
 *   post:
 *     summary: Submit quiz answers and get score
 *     tags: [Quizzes]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the quiz to submit
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 description: Array of answer indices (0-3) for each question in order
 *                 items:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 3
 *                 example: [0, 2, 1, 3, 0]
 *     responses:
 *       200:
 *         description: Quiz submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quizId:
 *                   type: string
 *                   format: uuid
 *                 score:
 *                   type: integer
 *                   description: Score as percentage (0-100)
 *                   example: 80
 *                 correctCount:
 *                   type: integer
 *                   example: 4
 *                 totalQuestions:
 *                   type: integer
 *                   example: 5
 *                 percentage:
 *                   type: integer
 *                   example: 80
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       questionIndex:
 *                         type: integer
 *                       correct:
 *                         type: boolean
 *                       correctAnswerIndex:
 *                         type: integer
 *                       userAnswerIndex:
 *                         type: integer
 *       400:
 *         description: Bad request
 *       404:
 *         description: Quiz not found
 *       500:
 *         description: Internal server error
 */
router.post('/:quizId/submit', ClerkExpressRequireAuth(), validate(submitQuizSchema, { paramsSchema: quizIdSchema }), asyncHandler(submitQuiz));

/**
 * @swagger
 * /api/quizzes/{quizId}/generate:
 *   post:
 *     summary: Generate quiz from selected topics
 *     tags: [Quizzes]
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the quiz to generate questions for
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topicIds
 *               - difficulty
 *             properties:
 *               topicIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of topic IDs to generate questions from
 *                 example: ["123e4567-e89b-12d3-a456-426614174000", "223e4567-e89b-12d3-a456-426614174001"]
 *               difficulty:
 *                 type: string
 *                 enum: [easy, medium, hard]
 *                 description: Difficulty level for the generated questions
 *                 example: "medium"
 *     responses:
 *       200:
 *         description: Quiz generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quizId:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 status:
 *                   type: string
 *                   example: "ready"
 *                 questionCount:
 *                   type: integer
 *                   example: 10
 *                 message:
 *                   type: string
 *                   example: "Successfully generated 10 questions from 3 topic(s)"
 *       400:
 *         description: Bad request - Validation failed or topics don't belong to quiz
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Some topic IDs do not belong to this quiz"
 *                 missingTopicIds:
 *                   type: array
 *                   items:
 *                     type: string
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to generate quiz from topics"
 */
router.post(
  '/:quizId/generate',
  validate(generateQuizSchema, { paramsSchema: quizIdSchema }),
  asyncHandler(generateQuizFromTopics)
);

export default router;

