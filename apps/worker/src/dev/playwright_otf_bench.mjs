/**
 * End-to-end page load benchmark with on-the-fly compression.
 * For each mode: SSH to server → swap nginx config → reload → load page N times.
 * Measures real user experience with different OTF compression settings.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const SERVER_HOST = '10.39.50.140';
const SERVER_URL = process.argv[2] || 'http://poolvm140.aquaterra.bx';
const ITERATIONS = parseInt(process.argv[3] || '12');
const WARMUP = 2;
const BLANK_URL = `${SERVER_URL}/blank.php`;

const MODES = ['none', 'gz1', 'gz5', 'gz9', 'zst1', 'zst5', 'zst9', 'default'];

function ssh(cmd) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execSync(
        `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@${SERVER_HOST} "${cmd.replace(/"/g, '\\"')}"`,
        { timeout: 15000, encoding: 'utf-8' }
      );
    } catch (e) {
      if (attempt < 2) {
        console.error(`  SSH retry ${attempt + 1}...`);
        execSync('sleep 2');
      } else throw e;
    }
  }
}

function applyMode(mode) {
  const result = ssh(`bash /tmp/apply_bench_mode.sh ${mode}`);
  if (!result.includes('applied')) {
    throw new Error(`Failed to apply mode ${mode}: ${result}`);
  }
  // Let nginx settle
  execSync('sleep 1');
}

console.error(`Server: ${SERVER_URL}`);
console.error(`Iterations: ${ITERATIONS} (+ ${WARMUP} warmup)`);
console.error(`Modes: ${MODES.join(', ')}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-http2'],
});
console.error(`Browser: Chromium ${browser.version()}\n`);

// CSV header
console.log('mode,iter,dom_content_loaded_ms,load_ms,transfer_size_kb,decoded_size_kb,resource_count');

for (const mode of MODES) {
  console.error(`=== Mode: ${mode} ===`);

  try {
    applyMode(mode);
  } catch (e) {
    console.error(`  SKIP ${mode}: ${e.message}`);
    continue;
  }

  // Verify compression mode via curl
  try {
    const check = ssh("curl -s -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: gzip, zstd' http://127.0.0.1/bitrix/js/main/core/core.min.js");
    console.error(`  core.min.js download size: ${check.trim()} bytes`);
  } catch (e) { /* ignore */ }

  for (let iter = -WARMUP; iter < ITERATIONS; iter++) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Accept-Encoding': 'gzip, deflate, br, zstd' },
    });
    const page = await context.newPage();

    try {
      await page.goto(BLANK_URL, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(500);

      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const assets = resources.filter(r => {
          const path = r.name.split('?')[0];
          return path.endsWith('.js') || path.endsWith('.css');
        });

        let totalTransfer = 0, totalDecoded = 0;
        for (const r of assets) {
          totalTransfer += r.transferSize || 0;
          totalDecoded += r.decodedBodySize || 0;
        }

        return {
          dcl: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
          load: nav ? nav.loadEventEnd - nav.startTime : 0,
          transferKB: totalTransfer / 1024,
          decodedKB: totalDecoded / 1024,
          count: assets.length,
        };
      });

      if (iter >= 0) {
        console.log(`${mode},${iter + 1},${metrics.dcl.toFixed(1)},${metrics.load.toFixed(1)},${metrics.transferKB.toFixed(1)},${metrics.decodedKB.toFixed(1)},${metrics.count}`);
      }

      if (iter === 0) {
        console.error(`  transfer=${metrics.transferKB.toFixed(0)}KB decoded=${metrics.decodedKB.toFixed(0)}KB resources=${metrics.count} load=${metrics.load.toFixed(0)}ms`);
      }
    } catch (e) {
      console.error(`  ERROR iter ${iter}: ${e.message}`);
    } finally {
      await context.close();
    }
  }
}

// Restore default
console.error('\n=== Restoring default ===');
try { applyMode('default'); console.error('Restored.'); } catch (e) { console.error(`WARN: ${e.message}`); }

await browser.close();
console.error('Done!');
