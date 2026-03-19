/**
 * Client-side decompression benchmark via Playwright.
 * Fetches raw compressed bytes from server (no Content-Encoding),
 * decompresses via DecompressionStream, measures pure decompression time.
 * Outputs CSV to stdout.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const SERVER = process.argv[2] || 'http://poolvm140.aquaterra.bx';
const ITERATIONS = parseInt(process.argv[3] || '15');

const MODES = [
  { key: 'gz1',  algo: 'gzip' },
  { key: 'gz5',  algo: 'gzip' },
  { key: 'gz9',  algo: 'gzip' },
  { key: 'zst1', algo: 'zstd' },
  { key: 'zst5', algo: 'zstd' },
  { key: 'zst9', algo: 'zstd' },
  { key: 'zst19', algo: 'zstd' },
];

// Load asset list
const assetsUrl = `${SERVER}/bench_assets.txt`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

// Navigate to server first (same origin for fetches)
await page.goto(`${SERVER}/decomp_bench.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Check DecompressionStream support
const support = await page.evaluate(() => {
  const result = {};
  try { new DecompressionStream('gzip'); result.gzip = true; } catch { result.gzip = false; }
  try { new DecompressionStream('zstd'); result.zstd = true; } catch { result.zstd = false; }
  return result;
});
console.error(`DecompressionStream support: gzip=${support.gzip}, zstd=${support.zstd}`);

// Fetch asset list
const assets = await page.evaluate(async (url) => {
  const resp = await fetch(url, { cache: 'no-store' });
  const text = await resp.text();
  return text.trim().split('\n').map(s => s.trim()).filter(s => s.startsWith('/'));
}, assetsUrl);
console.error(`Loaded ${assets.length} assets`);

// Output CSV header
console.log('mode,path,type,comp_bytes,orig_bytes,decomp_avg_ms,decomp_p50_ms,decomp_p95_ms');

for (const mode of MODES) {
  if (!support[mode.algo]) {
    console.error(`Skipping ${mode.key} — ${mode.algo} not supported`);
    continue;
  }

  console.error(`Benchmarking ${mode.key}...`);

  // Process assets in batches of 20 to avoid memory issues
  const BATCH = 20;
  for (let b = 0; b < assets.length; b += BATCH) {
    const batch = assets.slice(b, b + BATCH);

    const results = await page.evaluate(async ({ batch, mode, iterations, server }) => {
      const output = [];

      for (const assetPath of batch) {
        const relPath = assetPath.replace(/^\/bitrix\//, '');
        const url = `${server}/bench-raw-bytes/${mode.key}/${relPath}`;

        try {
          // Fetch compressed bytes
          const resp = await fetch(url, { cache: 'no-store' });
          if (!resp.ok) continue;
          const compressedBuf = await resp.arrayBuffer();
          const compBytes = compressedBuf.byteLength;

          // Decompress iterations
          const times = [];
          let origBytes = 0;

          for (let i = 0; i < iterations; i++) {
            const ds = new DecompressionStream(mode.algo);
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();

            const t0 = performance.now();

            const readPromise = (async () => {
              let total = 0;
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
              }
              return total;
            })();

            writer.write(new Uint8Array(compressedBuf));
            writer.close();
            const decompSize = await readPromise;

            const t1 = performance.now();
            times.push(t1 - t0);
            origBytes = decompSize;
          }

          // Stats
          times.sort((a, b) => a - b);
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          const p50 = times[Math.floor(times.length / 2)];
          const p95 = times[Math.floor(times.length * 0.95)];

          const type = assetPath.endsWith('.css') ? 'css' : 'js';
          output.push({ path: assetPath, type, compBytes, origBytes, avg, p50, p95 });
        } catch (e) {
          // Skip failed assets
        }
      }

      return output;
    }, { batch, mode, iterations: ITERATIONS, server: SERVER });

    for (const r of results) {
      console.log(`${mode.key},${r.path},${r.type},${r.compBytes},${r.origBytes},${r.avg.toFixed(3)},${r.p50.toFixed(3)},${r.p95.toFixed(3)}`);
    }
  }

  // Log mode summary
  console.error(`  ${mode.key} done`);
}

await browser.close();
console.error('Done!');
