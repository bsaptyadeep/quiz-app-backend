import * as cheerio from 'cheerio';

/**
 * Segments HTML content by headings (h1, h2, h3)
 * @param html - The HTML string to segment
 * @param metadata - Optional metadata for logging (quizId)
 * @returns Array of segments with title, level, and content paragraphs
 */
export function segmentContentByHeadings(
  html: string,
  metadata?: { quizId?: string }
): Array<{
  title: string;
  level: number;
  content: string[];
}> {
  const startTime = Date.now();
  
  // Load HTML into cheerio
  const $ = cheerio.load(html);

  // Remove unwanted elements (script, style, nav, footer, aside)
  $('script, style, nav, footer, aside').remove();

  const segments: Array<{
    title: string;
    level: number;
    content: string[];
  }> = [];

  // Find all headings (h1, h2, h3) in document order
  const headings = $('h1, h2, h3').toArray();

  // Process each heading
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const $heading = $(heading);
    
    // Extract heading text and determine level
    const title = $heading.text().trim();
    const tagName = heading.name?.toLowerCase() || $heading.prop('tagName')?.toLowerCase() || '';
    const level = tagName === 'h1' ? 1 : tagName === 'h2' ? 2 : 3;

    // Skip empty headings
    if (!title) {
      continue;
    }

    // Collect content paragraphs until next heading
    const content: string[] = [];
    
    // Find the next heading (if any)
    const nextHeading = headings[i + 1];
    
    // Traverse all following siblings until we hit the next heading
    let currentElement = $heading.next();
    
    while (currentElement.length > 0) {
      // Stop if we've reached the next heading
      if (nextHeading && currentElement[0] === nextHeading) {
        break;
      }
      
      // Check if current element or any descendant is the next heading
      if (nextHeading) {
        const containsNextHeading = currentElement
          .find('h1, h2, h3')
          .toArray()
          .includes(nextHeading);
        
        if (containsNextHeading) {
          break;
        }
      }

      // Collect all paragraph text from current element (including nested)
      currentElement.find('p').each((_, p) => {
        const text = $(p).text().trim();
        if (text) {
          content.push(text);
        }
      });
      
      // Also check if current element itself is a paragraph
      if (currentElement.is('p')) {
        const text = currentElement.text().trim();
        if (text) {
          content.push(text);
        }
      }

      // Move to next sibling
      currentElement = currentElement.next();
    }

    // Add segment
    segments.push({
      title,
      level,
      content,
    });
  }

  const elapsedTime = Date.now() - startTime;
  const totalContentLength = segments.reduce((sum, seg) => sum + seg.content.join(' ').length, 0);
  const tokenEstimate = Math.ceil(totalContentLength / 4); // ~4 chars per token

  // Structured logging
  console.log(JSON.stringify({
    event: 'topic_segmentation_complete',
    quizId: metadata?.quizId || null,
    topicCount: segments.length,
    elapsedTimeMs: elapsedTime,
    tokenEstimate,
    timestamp: new Date().toISOString(),
  }));

  return segments;
}

/**
 * Raw topic from segmentation
 */
type RawTopic = {
  title: string;
  level: number;
  content: string[];
};

/**
 * Normalized topic ready for DB storage
 */
export type NormalizedTopic = {
  title: string;
  summary?: string;
  level: number;
  parentIndex?: number; // Index of parent topic (for resolving parentId when saving to DB)
  content: string[];
  tokenEstimate: number;
};

/**
 * Estimates token count for text (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  // Simple approximation: ~4 characters per token for English text
  // This is a conservative estimate
  return Math.ceil(text.length / 4);
}

/**
 * Calculates total content length (sum of all paragraph lengths)
 */
function getContentLength(content: string[]): number {
  return content.join(' ').length;
}

/**
 * Calculates token estimate for a topic
 */
function getTopicTokenEstimate(topic: RawTopic): number {
  const fullText = `${topic.title} ${topic.content.join(' ')}`;
  return estimateTokens(fullText);
}

/**
 * Splits a topic into smaller chunks when it exceeds token limit
 */
function splitTopic(topic: RawTopic, maxTokens: number): RawTopic[] {
  const chunks: RawTopic[] = [];
  const topicTokens = getTopicTokenEstimate(topic);
  
  if (topicTokens <= maxTokens) {
    return [topic];
  }

  // Split content into chunks
  const contentText = topic.content.join(' ');
  const chunkSize = Math.floor((maxTokens * 4) * 0.8); // 80% of max to leave room for title
  
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const paragraph of topic.content) {
    const paraLength = paragraph.length;
    
    if (currentLength + paraLength > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        title: chunks.length === 0 ? topic.title : `${topic.title} (Part ${chunks.length + 1})`,
        level: topic.level,
        content: [...currentChunk],
      });
      currentChunk = [];
      currentLength = 0;
    }
    
    currentChunk.push(paragraph);
    currentLength += paraLength;
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      title: chunks.length === 0 ? topic.title : `${topic.title} (Part ${chunks.length + 1})`,
      level: topic.level,
      content: currentChunk,
    });
  }

  return chunks.length > 0 ? chunks : [topic];
}

/**
 * Normalizes topics by merging small ones, splitting large ones, and capping total count
 * @param rawTopics - Array of raw topics from segmentation (output from segmentContentByHeadings)
 * @returns Array of normalized topics ready for DB storage
 */
export function normalizeTopics(
  rawTopics: Array<{
    title: string;
    level: number;
    content: string[];
  }>
): NormalizedTopic[] {
  if (rawTopics.length === 0) {
    return [];
  }

  let normalized: RawTopic[] = [];

  // Step 1: Merge topics with content length < 300 chars into previous topic
  for (let i = 0; i < rawTopics.length; i++) {
    const topic = rawTopics[i];
    const contentLength = getContentLength(topic.content);

    if (contentLength < 300 && normalized.length > 0) {
      // Merge into previous topic
      const previous = normalized[normalized.length - 1];
      previous.content.push(...topic.content);
      // Update title to reflect merged content if needed
      if (previous.title !== topic.title) {
        previous.title = `${previous.title} / ${topic.title}`;
      }
    } else {
      normalized.push({ ...topic });
    }
  }

  // Step 2: Split topics whose estimated token size > 8000 into smaller chunks
  const splitTopics: RawTopic[] = [];
  for (const topic of normalized) {
    const chunks = splitTopic(topic, 8000);
    splitTopics.push(...chunks);
  }
  normalized = splitTopics;

  // Step 3: Cap total topics to 50
  if (normalized.length > 50) {
    // Sort by content length (smallest first) and merge smallest ones
    const sorted = [...normalized].sort((a, b) => 
      getContentLength(a.content) - getContentLength(b.content)
    );

    // Merge smallest topics until we're under 50
    const toMerge = sorted.slice(0, normalized.length - 50);
    const toKeep = sorted.slice(normalized.length - 50);

    // Merge all small topics into the first one to keep
    if (toKeep.length > 0 && toMerge.length > 0) {
      const firstToKeep = toKeep[0];
      for (const smallTopic of toMerge) {
        firstToKeep.content.push(...smallTopic.content);
        firstToKeep.title = `${firstToKeep.title} / ${smallTopic.title}`;
      }
    }

    normalized = toKeep;
  }

  // Step 4: Build parentIndex relationships and create final normalized topics
  const result: NormalizedTopic[] = [];
  const levelStack: { level: number; index: number }[] = []; // Track parent indices by level

  for (let i = 0; i < normalized.length; i++) {
    const topic = normalized[i];
    const tokenEstimate = getTopicTokenEstimate(topic);

    // Find parent based on hierarchy
    // Clear stack of levels >= current level (siblings or children)
    while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= topic.level) {
      levelStack.pop();
    }

    // Get parent index from stack
    const parentIndex = levelStack.length > 0 ? levelStack[levelStack.length - 1].index : undefined;

    // Push current topic to stack
    levelStack.push({ level: topic.level, index: i });

    // Create summary from first paragraph if available
    const summary = topic.content.length > 0 && topic.content[0].length > 100
      ? topic.content[0].substring(0, 200) + (topic.content[0].length > 200 ? '...' : '')
      : undefined;

    result.push({
      title: topic.title,
      summary,
      level: topic.level,
      parentIndex,
      content: topic.content,
      tokenEstimate: tokenEstimate,
    });
  }

  return result;
}
