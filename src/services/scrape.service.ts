import { chromium, Browser, Page } from 'playwright';

/**
 * Scrapes a website and returns cleaned text content
 * @param url - The URL of the website to scrape
 * @returns Promise<string> - The cleaned text content from the website
 * @throws Error if page fails to load or timeout occurs
 */
export async function scrapeWebsite(url: string): Promise<string> {
  let browser: Browser | null = null;

  try {
    // Launch Chromium browser in headless mode
    browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      executablePath: '/opt/render/.cache/ms-playwright/chromium-1200/chrome-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Create a new page
    const page: Page = await browser.newPage();

    // Navigate to URL with 30 second timeout
    // This will throw an error if the page fails to load within the timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000, // 30 seconds
    });

    // Wait for network to be idle to ensure page is fully loaded
    await page.waitForLoadState('networkidle');

    // Remove unwanted elements from the page
    // These elements typically contain navigation, styling, or non-content elements
    // Note: Code inside evaluate() runs in browser context where document exists
    await page.evaluate(() => {
      // Selectors for elements to remove
      const selectorsToRemove = [
        'script',
        'style',
        'nav',
        'footer',
        'header',
        'iframe',
        'aside',
      ];

      // Remove each unwanted element
      // Using type assertion since document exists in browser context
      const doc = (globalThis as any).document;
      selectorsToRemove.forEach((selector) => {
        const elements = doc.querySelectorAll(selector);
        elements.forEach((element: any) => element.remove());
      });
    });

    // Extract visible text from body.innerText
    // innerText only returns visible text and automatically handles whitespace
    // Note: Code inside evaluate() runs in browser context where document exists
    const text = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return doc.body.innerText;
    });

    // Normalize whitespace
    // Replace multiple whitespace characters (spaces, tabs, newlines) with single spaces
    // Trim leading and trailing whitespace
    const normalizedText = text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .trim(); // Remove leading and trailing whitespace

    // Return cleaned text content
    return normalizedText;
  } catch (error) {
    // Throw clear error if page fails to load
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('Navigation')) {
        throw new Error(`Failed to load page at ${url}: Page load timeout or navigation failed`);
      }
      throw new Error(`Failed to scrape website at ${url}: ${error.message}`);
    }
    throw new Error(`Failed to scrape website at ${url}: Unknown error occurred`);
  } finally {
    // Close browser safely in finally block to ensure cleanup even if errors occur
    if (browser) {
      await browser.close();
    }
  }
}

