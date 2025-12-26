import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import healthRouter from './routes/health.routes.js';
import quizRouter from './routes/quiz.routes.js';
import getSwaggerSpec from './swagger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { generalLimiter } from './middleware/rate-limit.middleware.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 4000;
const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins - customize for production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.use(express.json());

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Generate Swagger spec with current port
const swaggerSpec = getSwaggerSpec(Number(PORT));

// Swagger JSON endpoint
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Quiz Generator API',
  swaggerOptions: {
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
}));

// Health check route
app.use(healthRouter);

// API routes
const apiRouter = express.Router();
app.use('/api', apiRouter);

// Placeholder route
apiRouter.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// Quiz routes
apiRouter.use('/quizzes', quizRouter);

// Global error handler (must be after all routes)
app.use(errorHandler);

export default app;

