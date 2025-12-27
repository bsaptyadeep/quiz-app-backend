import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Builds OpenAI-compatible messages array for topic quiz generation
 * @param topicContent - Array of content paragraphs from the topic
 * @param topicTitle - Title of the topic
 * @param difficulty - Difficulty level (easy, medium, hard)
 * @param questionCount - Number of questions to generate (2-4)
 */
export function buildTopicQuizGeneratorMessages(
  topicContent: string[],
  topicTitle: string,
  difficulty: string = 'medium',
  questionCount: number = 3
): ChatCompletionMessageParam[] {
  const contentText = topicContent.join('\n\n');
  
  const systemPrompt = `
You are a professional quiz designer specializing in topic-based quizzes.

STRICT, NON-NEGOTIABLE RULES:
- You MUST generate EXACTLY the requested number of questions (${questionCount})
- Each question MUST have exactly 4 options
- EXACTLY ONE option must be correct
- The correct answer MUST be indicated using "answerIndex" (0–3)
- Questions MUST be answerable ONLY using the provided topic content
- Do NOT repeat questions
- Do NOT include explanations
- Output VALID JSON ONLY
- Do NOT include markdown
- Do NOT include any text outside the JSON object

Difficulty guidelines:
- Easy: Direct factual recall, simple concepts
- Medium: Requires understanding of concepts, some analysis
- Hard: Complex reasoning, synthesis of multiple concepts

If you cannot generate enough questions, you MUST still return placeholders
to reach the required count.

Failure to follow these rules is considered an error.
`.trim();

  const userPrompt = `
Generate a quiz based on the following topic:

Topic: ${topicTitle}

Content:
${contentText}

REQUIREMENTS:
- Number of questions: EXACTLY ${questionCount}
- Difficulty: ${difficulty}
- Question style: Appropriate for ${difficulty} difficulty level
- Base questions ONLY on the provided topic content
- Avoid ambiguous wording

You MUST return ONLY a valid JSON object with this exact structure:

{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answerIndex": number
    }
  ]
}

IMPORTANT:
- "questions" array length MUST be exactly ${questionCount}
- "answerIndex" MUST be between 0 and 3
- No extra fields
- No explanations
- No title field (questions only)

Return ONLY the JSON object. Nothing else.
`.trim();

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

