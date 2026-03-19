/**
 * End-to-end page load benchmark via Playwright.
 * Loads blank.php with different compression modes (set via cookie),
 * measures: DOMContentLoaded, Load, LCP, total transferSize, total decodedSize.
 * Outputs CSV to stdout.
 */
import { chromium } from 'playwright';

const SERVER = process.argv[2] || 'http://poolvm140.aquaterra.bx';
const ITERATIONS = parseInt(process.argv[3] || '10');

// Modes to test — cookie values
const MODES = [
  'default',  // no cookie — default nginx behavior (gzip_static + gzip 5)
  'none',     // uncompressed
  'gzip1',
  'gzip5',
  'gzip9',
  'zstd1',
  'zstd5',
  'zstd9',
  'zstd19',
];

const BLANK_URL = `${SERVER}/blank.php`;
const SET_ENC_URL = `${SERVER}/bench/set-encoding`;
const CLEAR_ENC_URL = `${SET_ENC_URL}?enc=clear`;

console.error(`Server: ${SERVER}`);
console.error(`Iterations: ${ITERATIONS}`);
console.error(`Modes: ${MODES.join(', ')}`);

// Launch browser with zstd support check
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-http2'],  // force HTTP/1.1 for cleaner measurements
});

// Print browser version
const version = browser.version();
console.error(`Browser version: ${version}`);

// CSV header
console.log('mode,iter,dom_content_loaded_ms,load_ms,lcp_ms,transfer_size_kb,decoded_size_kb,resource_count,total_duration_ms');

for (const mode of MODES) {
  console.error(`\n=== Mode: ${mode} ===`);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Encoding': 'gzip, deflate, br, zstd',
      },
    });
    const page = await context.newPage();

    try {
      // Set compression mode cookie directly
      if (mode !== 'default') {
        const url = new URL(SERVER);
        await context.addCookies([{
          name: 'bench_enc',
          value: mode,
          domain: url.hostname,
          path: '/',
        }]);
      }

      // Setup LCP observer before navigation
      await page.evaluate(() => {
        window.__lcpEntries = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__lcpEntries.push(entry);
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      });

      // Navigate to blank.php
      const t0 = Date.now();
      await page.goto(BLANK_URL, { waitUntil: 'load', timeout: 60000 });

      // Wait a bit for LCP to settle
      await page.waitForTimeout(1000);

      // Collect metrics
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');

        // Filter to JS/CSS resources only (strip query params)
        const assets = resources.filter(r => {
          const path = r.name.split('?')[0];
          return path.endsWith('.js') || path.endsWith('.css');
        });

        let totalTransfer = 0;
        let totalDecoded = 0;
        for (const r of assets) {
          totalTransfer += r.transferSize || 0;
          totalDecoded += r.decodedBodySize || 0;
        }

        // LCP
        const lcpEntries = window.__lcpEntries || [];
        const lcp = lcpEntries.length > 0
          ? lcpEntries[lcpEntries.length - 1].startTime
          : 0;

        return {
          domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
          load: nav ? nav.loadEventEnd - nav.startTime : 0,
          duration: nav ? nav.duration : 0,
          lcp,
          transferSizeKB: totalTransfer / 1024,
          decodedSizeKB: totalDecoded / 1024,
          resourceCount: assets.length,
        };
      });

      const totalMs = Date.now() - t0;

      console.log([
        mode,
        iter + 1,
        metrics.domContentLoaded.toFixed(1),
        metrics.load.toFixed(1),
        metrics.lcp.toFixed(1),
        metrics.transferSizeKB.toFixed(1),
        metrics.decodedSizeKB.toFixed(1),
        metrics.resourceCount,
        metrics.duration.toFixed(1),
      ].join(','));

      if (iter === 0) {
        console.error(`  transferSize=${metrics.transferSizeKB.toFixed(0)}KB, decoded=${metrics.decodedSizeKB.toFixed(0)}KB, resources=${metrics.resourceCount}, load=${metrics.load.toFixed(0)}ms`);
        // Debug: dump resource summary on first mode
        if (mode === MODES[0]) {
          const debug = await page.evaluate(() => {
            const all = performance.getEntriesByType('resource');
            const byType = {};
            for (const r of all) {
              const ext = r.name.split('?')[0].split('.').pop();
              byType[ext] = (byType[ext] || 0) + 1;
            }
            const jsCss = all.filter(r => r.name.endsWith('.js') || r.name.endsWith('.css'));
            return { total: all.length, byType, jsCssCount: jsCss.length };
          });
          console.error('  DEBUG:', JSON.stringify(debug));
        }
      }

    } catch (e) {
      console.error(`  ERROR iter ${iter + 1}: ${e.message}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
console.error('\nDone!');
