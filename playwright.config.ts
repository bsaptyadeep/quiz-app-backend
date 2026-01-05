import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
