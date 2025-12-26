/**
 * Cleans and normalizes text content
 * @param text - The raw text to clean
 * @returns The cleaned text
 */
export function cleanText(text: string): string {
  // Split text into lines for processing
  let lines = text.split('\n');

  // Remove lines shorter than 30 characters
  lines = lines.filter((line) => line.length >= 30);

  // Remove extra blank lines (collapse multiple consecutive blank lines)
  const cleanedLines: string[] = [];
  let previousWasBlank = false;

  for (const line of lines) {
    const isBlank = line.trim().length === 0;

    // Only add blank line if previous line wasn't blank
    if (isBlank) {
      if (!previousWasBlank) {
        cleanedLines.push('');
      }
      previousWasBlank = true;
    } else {
      cleanedLines.push(line);
      previousWasBlank = false;
    }
  }

  // Join lines back together
  let cleaned = cleanedLines.join('\n');

  // Collapse multiple spaces into single space
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Trim final output (remove leading and trailing whitespace)
  cleaned = cleaned.trim();

  return cleaned;
}

