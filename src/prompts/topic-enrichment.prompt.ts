import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * Builds OpenAI-compatible messages array for topic enrichment
 * @param title - The topic title
 * @param content - Array of content paragraphs
 * @returns Array of message objects for OpenAI API
 */
export function buildTopicEnrichmentMessages(
  title: string,
  content: string[]
): ChatCompletionMessageParam[] {
  const contentText = content.join('\n\n');
  
  const systemPrompt = `You are a topic enrichment assistant that improves topic metadata.
Your task is to analyze a topic (title + content) and return:
1. A rewritten title (maximum 6 words) that is concise and descriptive
2. A summary with 2-3 bullet points (each bullet should be a complete sentence)
3. An importance score from 1-5 (1 = least important, 5 = most important)

Return your response as a JSON object with this exact structure:
{
  "title": "rewritten title with max 6 words",
  "summary": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "importance": 3
}

Rules:
- Title must be ≤6 words, clear and descriptive
- Summary must have exactly 2-3 bullet points
- Each bullet point must be a complete sentence
- Importance must be an integer between 1 and 5
- Return ONLY valid JSON, no markdown, no explanations`;

  const userPrompt = `Please enrich the following topic:

Title: ${title}

Content:
${contentText}

Return the enriched topic as a JSON object with title, summary (2-3 bullets), and importance (1-5).`;

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ];
}

