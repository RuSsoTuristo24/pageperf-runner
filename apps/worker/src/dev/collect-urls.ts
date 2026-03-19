/**
 * Collects all JS/CSS URLs loaded by a page via Playwright.
 * Outputs one URL per line to stdout.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storageDir = resolve(__dirname, '../../../../storage/auth');

const targetUrl = process.argv[2] ?? 'http://poolvm30.aquaterra.bx/blank.php';
const authFile = resolve(storageDir, 'bench-none.json');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: JSON.parse(readFileSync(authFile, 'utf-8')),
  ignoreHTTPSErrors: true,
});

const urls: string[] = [];

const page = await context.newPage();

page.on('response', (resp) => {
  const url = resp.url();
  const ct = resp.headers()['content-type'] || '';
  if (/\.(js|css)(\?|$)/i.test(url) || ct.includes('javascript') || ct.includes('text/css')) {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.startsWith('/bitrix/') && !urls.includes(path)) {
      urls.push(path);
    }
  }
});

await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
// Wait for async scripts (IM, call, pull, etc.)
await page.waitForTimeout(15000);

await browser.close();

// Output
urls.sort();
const jsCount = urls.filter(u => u.endsWith('.js')).length;
const cssCount = urls.filter(u => u.endsWith('.css')).length;
console.error(`Collected ${urls.length} URLs: ${jsCount} JS + ${cssCount} CSS`);

for (const u of urls) {
  console.log(u);
}
