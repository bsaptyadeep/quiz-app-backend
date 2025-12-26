# Quiz Generator Backend API - Complete Documentation

## Overview
This is a RESTful API backend for a shareable quiz application that generates quizzes from website URLs. The backend uses asynchronous processing to create quizzes, allowing for better scalability and user experience.

**Base URL**: `http://localhost:4000` (or configured PORT)
**API Prefix**: `/api`
**API Documentation**: Available at `/api/docs` (Swagger UI)

---

## Table of Contents
1. [Architecture & Technology Stack](#architecture--technology-stack)
2. [Authentication & Security](#authentication--security)
3. [Rate Limiting](#rate-limiting)
4. [API Endpoints](#api-endpoints)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Quiz Generation Workflow](#quiz-generation-workflow)
8. [Status Codes](#status-codes)
9. [Environment Variables](#environment-variables)
10. [Database Schema](#database-schema)

---

## Architecture & Technology Stack

### Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Web Scraping**: Playwright (Chromium)
- **AI/LLM**: OpenAI GPT-4o-mini
- **Validation**: Zod
- **Documentation**: Swagger/OpenAPI

### Server Configuration
- Default Port: `4000` (configurable via `PORT` env variable)
- CORS: Enabled for all origins (development mode)
- JSON: All requests/responses use JSON
- Rate Limiting: Applied per IP address

---

## Authentication & Security

**Current Status**: No authentication required (MVP)

**Security Features**:
- Input validation via Zod schemas
- Rate limiting per IP
- UUID validation for quiz IDs
- URL validation for source URLs
- Error messages sanitized (no stack traces in production)

**Note for Production**: 
- CORS should be restricted to specific origins
- Consider adding API key authentication or OAuth
- Implement request timeout limits

---

## Rate Limiting

Rate limits are applied per IP address:

### General API Endpoints
- **Limit**: 100 requests per 15 minutes per IP
- **Applied to**: All `/api/*` routes (except quiz creation)
- **Headers**: Rate limit info in `RateLimit-*` headers

### Quiz Creation Endpoint
- **Limit**: 10 requests per 15 minutes per IP
- **Applied to**: `POST /api/quizzes`
- **Error Response**: 
  ```json
  {
    "error": "Too many quiz creation requests from this IP, please try again later."
  }
  ```
  - **Status Code**: 429 (Too Many Requests)

---

## API Endpoints

### 1. Health Check

**GET** `/health`

Check if the server is running.

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

### 2. Create Quiz

**POST** `/api/quizzes`

Creates a new quiz from a website URL. This endpoint returns immediately with a quiz ID and `processing` status. The quiz generation happens asynchronously in the background.

**Rate Limit**: 10 requests per 15 minutes per IP

**Request Body**:
```json
{
  "source_url": "https://example.com/article"
}
```

**Request Validation**:
- `source_url` (required): Must be a valid URL string

**Response** (201 Created):
```json
{
  "quiz_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "processing",
  "message": "Quiz is being generated. Poll the quiz endpoint to check status."
}
```

**Error Responses**:

- **400 Bad Request** - Validation failed:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "source_url",
      "message": "source_url must be a valid URL"
    }
  ]
}
```

- **429 Too Many Requests** - Rate limit exceeded:
```json
{
  "error": "Too many quiz creation requests from this IP, please try again later."
}
```

- **500 Internal Server Error**:
```json
{
  "error": "Failed to create quiz"
}
```

**Notes**:
- Quiz generation is asynchronous - poll `GET /api/quizzes/:quizId` to check status
- Only works with publicly accessible websites (no paywalls or login required)
- Typical generation time: 10-30 seconds depending on content length
- Quiz status will update from `processing` → `ready` or `failed`

---

### 3. Get Quiz by ID

**GET** `/api/quizzes/:quizId`

Retrieves a quiz by its ID. Returns quiz details including questions (without correct answers).

**Path Parameters**:
- `quizId` (required): UUID string - must be valid UUID format

**Response** (200 OK):

**When quiz is ready**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "sourceUrl": "https://example.com/article",
  "title": "Understanding Machine Learning Basics",
  "questions": [
    {
      "question": "What is the primary goal of machine learning?",
      "options": [
        "To enable computers to learn without explicit programming",
        "To create faster processors",
        "To design better user interfaces",
        "To improve internet connectivity"
      ]
    },
    // ... more questions (5-10 total)
  ],
  "status": "ready",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

**When quiz is still processing**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "sourceUrl": "https://example.com/article",
  "title": null,
  "questions": null,
  "status": "processing",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

**When quiz generation failed**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "sourceUrl": "https://example.com/article",
  "title": null,
  "questions": null,
  "status": "failed",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:

- **400 Bad Request** - Invalid quiz ID:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "quizId",
      "message": "Quiz ID must be a valid UUID"
    }
  ]
}
```

- **404 Not Found**:
```json
{
  "error": "Quiz not found"
}
```

- **500 Internal Server Error**:
```json
{
  "error": "Failed to fetch quiz"
}
```

**Frontend Implementation Notes**:
- Poll this endpoint every 2-3 seconds while `status === "processing"`
- Show loading state when `status === "processing"` or `questions === null`
- Display error message when `status === "failed"`
- Only show quiz questions when `status === "ready"` and `questions !== null`

---

### 4. Submit Quiz Answers

**POST** `/api/quizzes/:quizId/submit`

Submits answers for a quiz and returns the score with detailed results.

**Path Parameters**:
- `quizId` (required): UUID string - must be valid UUID format

**Request Body**:
```json
{
  "answers": [0, 2, 1, 3, 0]
}
```

**Request Validation**:
- `answers` (required): Array of integers, each between 0-3 (inclusive)
  - Each number represents the index of the selected option (0 = first option, 1 = second, etc.)
  - Array length must match the number of questions in the quiz
  - All values must be integers between 0 and 3

**Response** (200 OK):
```json
{
  "quizId": "123e4567-e89b-12d3-a456-426614174000",
  "score": 80,
  "correctCount": 4,
  "totalQuestions": 5,
  "percentage": 80,
  "results": [
    {
      "questionIndex": 0,
      "correct": true,
      "correctAnswerIndex": 0,
      "userAnswerIndex": 0
    },
    {
      "questionIndex": 1,
      "correct": false,
      "correctAnswerIndex": 2,
      "userAnswerIndex": 1
    },
    {
      "questionIndex": 2,
      "correct": true,
      "correctAnswerIndex": 1,
      "userAnswerIndex": 1
    },
    {
      "questionIndex": 3,
      "correct": true,
      "correctAnswerIndex": 3,
      "userAnswerIndex": 3
    },
    {
      "questionIndex": 4,
      "correct": true,
      "correctAnswerIndex": 0,
      "userAnswerIndex": 0
    }
  ]
}
```

**Response Fields**:
- `quizId`: The quiz ID
- `score`: Percentage score (0-100)
- `correctCount`: Number of correct answers
- `totalQuestions`: Total number of questions
- `percentage`: Same as score (for convenience)
- `results`: Array of result objects, one per question
  - `questionIndex`: Zero-based index of the question
  - `correct`: Boolean indicating if answer was correct
  - `correctAnswerIndex`: The index of the correct answer (0-3)
  - `userAnswerIndex`: The index of the user's answer (0-3)

**Error Responses**:

- **400 Bad Request** - Validation failed:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "answers",
      "message": "Expected number, received string"
    }
  ]
}
```

- **400 Bad Request** - Quiz not ready:
```json
{
  "error": "Quiz is not ready. Current status: processing"
}
```

- **400 Bad Request** - Answer count mismatch:
```json
{
  "error": "Number of answers (4) does not match number of questions (5)"
}
```

- **400 Bad Request** - Invalid answer value:
```json
{
  "error": "Invalid answer at index 2. Must be a number between 0 and 3"
}
```

- **404 Not Found**:
```json
{
  "error": "Quiz not found"
}
```

- **500 Internal Server Error**:
```json
{
  "error": "Failed to submit quiz"
}
```

**Frontend Implementation Notes**:
- Only allow submission when quiz status is `ready`
- Validate that answers array length matches questions length
- Display score prominently after submission
- Show correct/incorrect indicators for each question
- Highlight user's answers vs correct answers

---

## Data Models

### Quiz Object (Database Schema)
```typescript
{
  id: string;              // UUID, auto-generated
  sourceUrl: string;       // The original URL used to generate the quiz
  title: string | null;    // Quiz title (null during processing)
  questions: Json;         // Array of MCQ objects (stored as JSON)
  status: string;          // "processing" | "ready" | "failed"
  createdAt: Date;         // ISO 8601 timestamp
}
```

### MCQ (Multiple Choice Question) Object
```typescript
{
  question: string;        // The question text
  options: string[];       // Array of exactly 4 option strings
  answerIndex: number;     // Index of correct answer (0-3) - NOT returned to clients
}
```

### Quiz Response (Client-facing)
```typescript
{
  id: string;
  sourceUrl: string;
  title: string | null;
  questions: MCQ[] | null;  // null if status !== "ready"
  status: "processing" | "ready" | "failed";
  createdAt: string;        // ISO 8601 date string
}
```

### MCQ Response (Client-facing, no answerIndex)
```typescript
{
  question: string;
  options: string[];  // Always 4 options
}
```

### Quiz Submission Request
```typescript
{
  answers: number[];  // Array of answer indices (0-3) for each question in order
}
```

### Quiz Submission Response
```typescript
{
  quizId: string;
  score: number;              // 0-100
  correctCount: number;
  totalQuestions: number;
  percentage: number;         // Same as score
  results: Array<{
    questionIndex: number;    // 0-based
    correct: boolean;
    correctAnswerIndex: number;  // 0-3
    userAnswerIndex: number;     // 0-3
  }>;
}
```

---

## Error Handling

### Error Response Format
All errors follow a consistent format:
```json
{
  "error": "Error message description"
}
```

Validation errors include additional details:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "field.path",
      "message": "Specific validation error message"
    }
  ]
}
```

### Common Error Scenarios

1. **Validation Errors (400)**:
   - Invalid URL format
   - Missing required fields
   - Invalid data types
   - Out of range values

2. **Not Found (404)**:
   - Quiz ID doesn't exist
   - Invalid UUID format (caught by validation)

3. **Rate Limit (429)**:
   - Too many requests from same IP

4. **Server Errors (500)**:
   - Database connection issues
   - External API failures (OpenAI)
   - Web scraping failures
   - Unexpected errors

### Error Handling Best Practices (Frontend)
- Always check response status codes
- Handle validation errors by showing field-specific messages
- Implement retry logic for 500 errors (with exponential backoff)
- Show user-friendly error messages
- Log errors for debugging

---

## Quiz Generation Workflow

### Asynchronous Processing Flow

1. **Client Request**: `POST /api/quizzes` with `source_url`
2. **Immediate Response**: Returns `quiz_id` with `status: "processing"`
3. **Background Processing**:
   - Web scraping: Extracts text content from the URL
   - Content condensation: Uses LLM to extract key points
   - Quiz generation: Uses LLM to create 5-10 multiple-choice questions
   - Database update: Saves quiz with `status: "ready"` or `"failed"`

### Processing States

- **`processing`**: Quiz is being generated
  - `questions` = `null`
  - `title` = `null`
  - Frontend should poll `/api/quizzes/:quizId` every 2-3 seconds

- **`ready`**: Quiz generation completed successfully
  - `questions` = Array of MCQ objects (without `answerIndex`)
  - `title` = Generated quiz title
  - Quiz can be displayed and submitted

- **`failed`**: Quiz generation failed
  - `questions` = `null`
  - `title` = `null`
  - Frontend should show error message and allow retry

### Typical Processing Times
- **Small articles (< 2000 words)**: 10-20 seconds
- **Medium articles (2000-5000 words)**: 20-30 seconds
- **Large articles (> 5000 words)**: 30-45 seconds
- **Failed requests**: Usually fail within 5-10 seconds (invalid URL, timeout, etc.)

---

## Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/POST requests |
| 201 | Created | Quiz created successfully |
| 400 | Bad Request | Validation errors, invalid input |
| 404 | Not Found | Quiz ID doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side errors |

---

## Environment Variables

### Required Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/quizdb
OPENAI_API_KEY=sk-...
```

- **`DATABASE_URL`**: PostgreSQL connection string
  - Format: `postgresql://username:password@host:port/database`
  - Must be a valid URL format
  - Validated on server startup

- **`OPENAI_API_KEY`**: OpenAI API key for LLM calls
  - Must be valid OpenAI API key
  - Used for content condensation and quiz generation

### Optional Variables

```bash
PORT=4000                    # Server port (default: 4000)
NODE_ENV=development         # Environment mode (affects error messages)
```

**Environment Validation**:
- Server validates required variables on startup
- Exits with error message if missing
- Checks DATABASE_URL format validity

---

## Database Schema

### Prisma Schema

```prisma
model Quiz {
  id         String   @id @default(uuid())
  sourceUrl  String
  title      String?
  questions  Json
  status     String   @default("ready")
  createdAt  DateTime @default(now())

  @@map("quizzes")
}
```

### Field Descriptions

- **`id`**: Primary key, UUID v4, auto-generated
- **`sourceUrl`**: Original URL used to generate quiz, required
- **`title`**: Generated quiz title, nullable (null during processing)
- **`questions`**: JSON field storing array of MCQ objects
  - Stored format includes `answerIndex` for server-side use
  - Never exposed to clients in GET responses
- **`status`**: String enum-like field
  - Possible values: `"processing"`, `"ready"`, `"failed"`
  - Default: `"ready"` (for backwards compatibility)
- **`createdAt`**: Timestamp of quiz creation, auto-generated

### Database Relationships
Currently no relationships (single table design for MVP).

---

## Frontend Integration Guide

### Recommended Frontend Flow

1. **Quiz Creation**:
   ```javascript
   // 1. Create quiz
   const response = await fetch('/api/quizzes', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ source_url: url })
   });
   const { quiz_id, status } = await response.json();
   
   // 2. Poll for completion
   const pollInterval = setInterval(async () => {
     const quizResponse = await fetch(`/api/quizzes/${quiz_id}`);
     const quiz = await quizResponse.json();
     
     if (quiz.status === 'ready') {
       clearInterval(pollInterval);
       // Display quiz
     } else if (quiz.status === 'failed') {
       clearInterval(pollInterval);
       // Show error
     }
   }, 2000); // Poll every 2 seconds
   ```

2. **Quiz Submission**:
   ```javascript
   // Collect user answers (array of indices 0-3)
   const answers = [0, 2, 1, 3, 0];
   
   const response = await fetch(`/api/quizzes/${quizId}/submit`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ answers })
   });
   
   const results = await response.json();
   // Display score and results
   ```

### TypeScript Types (Recommended)

```typescript
// Quiz status types
type QuizStatus = 'processing' | 'ready' | 'failed';

// MCQ (client-facing, no answerIndex)
interface MCQ {
  question: string;
  options: string[];
}

// Quiz response from GET endpoint
interface QuizResponse {
  id: string;
  sourceUrl: string;
  title: string | null;
  questions: MCQ[] | null;
  status: QuizStatus;
  createdAt: string;
}

// Quiz creation response
interface CreateQuizResponse {
  quiz_id: string;
  status: 'processing';
  message: string;
}

// Quiz submission request
interface SubmitQuizRequest {
  answers: number[]; // Array of indices 0-3
}

// Quiz submission response
interface QuizResult {
  questionIndex: number;
  correct: boolean;
  correctAnswerIndex: number;
  userAnswerIndex: number;
}

interface SubmitQuizResponse {
  quizId: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  results: QuizResult[];
}
```

### Error Handling Example

```typescript
async function createQuiz(url: string): Promise<string> {
  try {
    const response = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: url })
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment.');
      }
      const error = await response.json();
      throw new Error(error.error || 'Failed to create quiz');
    }
    
    const data = await response.json();
    return data.quiz_id;
  } catch (error) {
    console.error('Error creating quiz:', error);
    throw error;
  }
}
```

---

## API Documentation (Swagger)

Interactive API documentation is available at:
- **URL**: `http://localhost:4000/api/docs`
- **JSON Spec**: `http://localhost:4000/api/docs.json`

The Swagger UI allows you to:
- View all endpoints
- See request/response schemas
- Test endpoints directly
- View example requests/responses

---

## Testing Checklist for Frontend

- [ ] Quiz creation with valid URL
- [ ] Quiz creation with invalid URL (shows validation error)
- [ ] Polling quiz status during processing
- [ ] Display quiz when status becomes "ready"
- [ ] Handle "failed" status gracefully
- [ ] Submit quiz with valid answers
- [ ] Submit quiz with wrong answer count (shows error)
- [ ] Submit quiz before ready (shows error)
- [ ] Display score and results after submission
- [ ] Rate limit handling (429 errors)
- [ ] Network error handling
- [ ] Loading states during API calls

---

## Production Considerations

### Not Yet Implemented (Future Enhancements)
- User authentication/authorization
- CORS restrictions (currently allows all origins)
- Request timeout limits
- Structured logging
- Metrics/monitoring
- Caching layer
- Database connection pooling configuration
- Request body size limits

### Recommended for Production
1. **Environment-specific CORS**:
   ```javascript
   origin: process.env.FRONTEND_URL || 'http://localhost:3000'
   ```

2. **Request Timeouts**:
   - Add timeout middleware to prevent long-running requests

3. **Monitoring**:
   - Add health checks for database and external services
   - Implement request/response logging

4. **Error Tracking**:
   - Integrate error tracking service (Sentry, etc.)
   - Log errors with context

---

## Support & Troubleshooting

### Common Issues

1. **Quiz stuck in "processing"**:
   - Check server logs for errors
   - Quiz generation may have failed silently
   - Consider implementing a timeout (currently unlimited)

2. **Rate limit errors**:
   - Wait 15 minutes or use different IP
   - Adjust rate limits in production if needed

3. **Validation errors**:
   - Check request body matches expected schema
   - Ensure UUID format for quiz IDs
   - Verify URL format for source URLs

4. **Connection errors**:
   - Verify DATABASE_URL is correct
   - Check OpenAI API key is valid
   - Ensure database is accessible

---

## Version Information

- **API Version**: 1.0.0
- **Backend Version**: 1.0.0
- **Last Updated**: 2024-12-21

---

## Contact & Support

For API documentation and interactive testing, visit:
- Swagger UI: `/api/docs`
- Health Check: `/health`

---

*This document is intended for frontend development and integration. For backend development, refer to the source code and inline documentation.*

