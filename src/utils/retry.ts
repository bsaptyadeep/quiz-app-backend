/**
 * Retries a function with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds for exponential backoff (default: 1000)
 * @returns Promise<T> - The result of the function
 * @throws Error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate exponential backoff delay: baseDelay * 2^attempt
      const delayMs = baseDelayMs * Math.pow(2, attempt);

      // Log retry attempt
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms delay. Error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

