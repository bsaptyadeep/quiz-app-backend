import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Validation middleware factory
 * Creates a middleware that validates request body against a Zod schema
 * Optionally validates path parameters and query parameters
 */
export function validate(
  bodySchema?: ZodSchema,
  options?: { paramsSchema?: ZodSchema; querySchema?: ZodSchema }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body if schema provided
      if (bodySchema) {
        bodySchema.parse(req.body);
      }
      
      // Validate params if schema provided
      if (options?.paramsSchema) {
        options.paramsSchema.parse(req.params);
      }
      
      // Validate query if schema provided
      if (options?.querySchema) {
        options.querySchema.parse(req.query);
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Invalid request' });
    }
  };
}

/**
 * Schema for POST /api/quizzes request body
 */
export const createQuizSchema = z.object({
  source_url: z.string().url('source_url must be a valid URL'),
});

/**
 * Schema for POST /api/quizzes/:id/submit request body
 */
export const submitQuizSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).min(1, 'Answers array must not be empty'),
});

/**
 * Schema for quiz ID path parameter
 */
export const quizIdSchema = z.object({
  quizId: z.string().uuid('Quiz ID must be a valid UUID'),
});

/**
 * Schema for POST /api/quizzes/:quizId/generate request body
 */
export const generateQuizSchema = z.object({
  topicIds: z.array(z.string().uuid('Topic ID must be a valid UUID')).min(1, 'At least one topic ID is required'),
  difficulty: z.enum(['easy', 'medium', 'hard'], {
    errorMap: () => ({ message: 'Difficulty must be one of: easy, medium, hard' }),
  }),
});

