import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Builds OpenAI-compatible messages array for quiz generation
 * @param keyPointsJson - JSON string of key points array to generate quiz from
 */
export function buildQuizGeneratorMessages(
  keyPointsJson: string,
  questionCount = 5
): ChatCompletionMessageParam[] {
  const systemPrompt = `
You are a professional quiz designer.

STRICT, NON-NEGOTIABLE RULES:
- You MUST generate EXACTLY the requested number of questions
- The number of questions MUST be between 5 and 10
- Each question MUST have exactly 4 options
- EXACTLY ONE option must be correct
- The correct answer MUST be indicated using "answerIndex" (0–3)
- Questions MUST be answerable ONLY using the provided key points
- Do NOT repeat questions
- Do NOT include explanations
- Output VALID JSON ONLY
- Do NOT include markdown
- Do NOT include any text outside the JSON object

If you cannot generate enough questions, you MUST still return placeholders
to reach the required count.

Failure to follow these rules is considered an error.
`.trim();

  const userPrompt = `
Generate a quiz based on the following key points:

${keyPointsJson}

REQUIREMENTS:
- Number of questions: EXACTLY ${questionCount}
- Difficulty: easy to medium
- Question style: direct factual recall
- Avoid ambiguous wording

You MUST return ONLY a valid JSON object with this exact structure:

{
  "title": "string",
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

Return ONLY the JSON object. Nothing else.
`.trim();

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}
