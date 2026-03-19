/**
 * Compression benchmark: profiles a page with different encoding modes
 * using Playwright storage state files to set the bench_enc cookie + auth.
 *
 * Usage:
 *   npx tsx src/dev/run-bench-compare.ts <URL> [THROTTLING]
 *
 * Example:
 *   npx tsx src/dev/run-bench-compare.ts http://poolvm30.aquaterra.bx/blank.php native
 *   npx tsx src/dev/run-bench-compare.ts http://poolvm30.aquaterra.bx/blank.php slow-4g
 */
import { createQueuedRunJob } from '../queue/run-job.js';
import { createRunner, defaultExecuteLiveRun } from '../runner/runner.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storageDir = resolve(__dirname, '../../../../storage/auth');

const targetUrl = process.argv[2] ?? 'http://poolvm30.aquaterra.bx/blank.php';
const throttling = (process.argv[3] as 'native' | 'slow-4g' | 'fast-3g' | 'slow-3g' | undefined) ?? 'native';

interface EncodingMode {
  name: string;
  authStatePath: string;
}

const modes: EncodingMode[] = [
  { name: 'none',   authStatePath: resolve(storageDir, 'bench-none.json') },
  { name: 'gzip1',  authStatePath: resolve(storageDir, 'bench-gzip1.json') },
  { name: 'gzip9',  authStatePath: resolve(storageDir, 'bench-gzip9.json') },
  { name: 'zstd3',  authStatePath: resolve(storageDir, 'bench-zstd3.json') },
  { name: 'zstd5',  authStatePath: resolve(storageDir, 'bench-zstd5.json') },
  { name: 'zstd9',  authStatePath: resolve(storageDir, 'bench-zstd9.json') },
  { name: 'zstd15', authStatePath: resolve(storageDir, 'bench-zstd15.json') },
  { name: 'zstd19', authStatePath: resolve(storageDir, 'bench-zstd19.json') },
];

// Verify storage state files exist
for (const mode of modes) {
  if (!existsSync(mode.authStatePath)) {
    console.error(`Missing storage state file: ${mode.authStatePath}`);
    process.exit(1);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`Compression Benchmark: gzip1 / gzip9 / zstd3..19`);
console.log(`URL: ${targetUrl}`);
console.log(`Throttling: ${throttling}`);
console.log(`Modes: ${modes.map(m => m.name).join(', ')}`);
console.log(`${'='.repeat(70)}\n`);

interface ModeResult {
  name: string;
  status: string;
  loadMs: number;
  fcp: number;
  lcp: number;
  ttfb: number;
  requestCount: number;
  totalTransferKB: number;
  totalDecodedKB: number;
  jsTransferKB: number;
  cssTransferKB: number;
  requests: Array<{
    url: string;
    resourceType: string;
    transferSize: number;
    decodedSize: number;
    duration: number;
    contentEncoding: string;
  }>;
}

const results: ModeResult[] = [];

for (const mode of modes) {
  console.log(`\n--- Profiling: ${mode.name.toUpperCase()} ---`);

  const runner = createRunner({ executeLiveRun: defaultExecuteLiveRun });
  const runId = `bench-${mode.name}-${Date.now()}`;

  try {
    const result = await runner.start(createQueuedRunJob({
      runId,
      profileId: `bench-compare-${throttling}`,
      targetUrl,
      throttling,
      authStatePath: mode.authStatePath,
    }));

    // Extract metrics
    const pageMetric = (name: string) => {
      const m = result.pageMetrics?.find((m: any) => m.name === name);
      return m?.value ?? 0;
    };

    const requests = result.requests.map((r: any) => ({
      url: r.url,
      resourceType: r.resourceType,
      transferSize: r.transferSize ?? 0,
      decodedSize: r.decodedBodySize ?? 0,
      duration: r.durationMs ?? 0,
      contentEncoding: r.contentEncoding ?? 'identity',
    }));

    const assetRequests = requests.filter(
      (r: any) => r.resourceType === 'script' || r.resourceType === 'stylesheet'
    );

    const totalTransfer = assetRequests.reduce((s: number, r: any) => s + r.transferSize, 0);
    const totalDecoded = assetRequests.reduce((s: number, r: any) => s + r.decodedSize, 0);
    const jsTransfer = assetRequests.filter((r: any) => r.resourceType === 'script')
      .reduce((s: number, r: any) => s + r.transferSize, 0);
    const cssTransfer = assetRequests.filter((r: any) => r.resourceType === 'stylesheet')
      .reduce((s: number, r: any) => s + r.transferSize, 0);

    const modeResult: ModeResult = {
      name: mode.name,
      status: result.status,
      loadMs: pageMetric('load'),
      fcp: pageMetric('fcp'),
      lcp: pageMetric('lcp'),
      ttfb: pageMetric('ttfb'),
      requestCount: result.requests.length,
      totalTransferKB: totalTransfer / 1024,
      totalDecodedKB: totalDecoded / 1024,
      jsTransferKB: jsTransfer / 1024,
      cssTransferKB: cssTransfer / 1024,
      requests: assetRequests,
    };

    results.push(modeResult);

    console.log(`  Status: ${result.status}`);
    console.log(`  Load: ${modeResult.loadMs.toFixed(0)}ms | FCP: ${modeResult.fcp.toFixed(0)}ms | LCP: ${modeResult.lcp.toFixed(0)}ms | TTFB: ${modeResult.ttfb.toFixed(0)}ms`);
    console.log(`  Transfer: ${modeResult.totalTransferKB.toFixed(1)} KB (JS: ${modeResult.jsTransferKB.toFixed(1)} KB, CSS: ${modeResult.cssTransferKB.toFixed(1)} KB)`);
    console.log(`  Decoded:  ${modeResult.totalDecodedKB.toFixed(1)} KB`);
    console.log(`  Requests: ${modeResult.requestCount}`);

  } catch (err) {
    console.error(`  Error profiling ${mode.name}:`, err);
    results.push({
      name: mode.name, status: 'error', loadMs: 0, fcp: 0, lcp: 0, ttfb: 0,
      requestCount: 0, totalTransferKB: 0, totalDecodedKB: 0,
      jsTransferKB: 0, cssTransferKB: 0, requests: [],
    });
  }
}

// Print comparison table
console.log(`\n${'='.repeat(80)}`);
console.log('COMPARISON SUMMARY');
console.log(`${'='.repeat(80)}`);
console.log('');

const header = ['Mode', 'Transfer KB', 'JS KB', 'CSS KB', 'Decoded KB', 'TTFB ms', 'FCP ms', 'LCP ms', 'Load ms'];
const colW = [8, 13, 10, 10, 11, 9, 8, 8, 9];
console.log(header.map((h, i) => h.padStart(colW[i])).join(' | '));
console.log(colW.map(w => '-'.repeat(w)).join('-+-'));

for (const r of results) {
  const row = [
    r.name.padStart(colW[0]),
    r.totalTransferKB.toFixed(1).padStart(colW[1]),
    r.jsTransferKB.toFixed(1).padStart(colW[2]),
    r.cssTransferKB.toFixed(1).padStart(colW[3]),
    r.totalDecodedKB.toFixed(1).padStart(colW[4]),
    r.ttfb.toFixed(0).padStart(colW[5]),
    r.fcp.toFixed(0).padStart(colW[6]),
    r.lcp.toFixed(0).padStart(colW[7]),
    r.loadMs.toFixed(0).padStart(colW[8]),
  ];
  console.log(row.join(' | '));
}

// Savings comparison
const noneResult = results.find(r => r.name === 'none');
const gzip1Result = results.find(r => r.name === 'gzip1');
const gzip9Result = results.find(r => r.name === 'gzip9');

console.log('');
console.log('SAVINGS vs none (uncompressed):');
for (const r of results) {
  if (r.name === 'none' || !noneResult) continue;
  const savings = noneResult.totalTransferKB - r.totalTransferKB;
  const pct = (savings / noneResult.totalTransferKB * 100).toFixed(1);
  console.log(`  ${r.name.padEnd(8)} saves ${savings.toFixed(1)} KB (${pct}%)`);
}

if (gzip1Result) {
  console.log('');
  console.log('SAVINGS vs gzip1 (Bitrix24 cloud default):');
  for (const r of results) {
    if (r.name === 'none' || r.name === 'gzip1' || !gzip1Result) continue;
    const savings = gzip1Result.totalTransferKB - r.totalTransferKB;
    const pct = (savings / gzip1Result.totalTransferKB * 100).toFixed(1);
    const sign = savings > 0 ? '+' : '';
    console.log(`  ${r.name.padEnd(8)} ${sign}${savings.toFixed(1)} KB (${sign}${pct}%)`);
  }
}

// Per-asset comparison (gzip1 vs zstd levels)
if (gzip1Result) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('PER-ASSET COMPARISON vs gzip1');
  console.log(`${'='.repeat(80)}`);

  const zstdModes = results.filter(r => r.name.startsWith('zstd'));
  const assetHeader = ['Asset', 'Type', 'gzip1 KB', ...zstdModes.map(m => `${m.name} KB`), 'Best Δ%'];
  console.log(assetHeader.map(h => h.padEnd(h === 'Asset' ? 45 : 10)).join(' '));
  console.log('-'.repeat(45 + 10 * (zstdModes.length + 2)));

  for (const gReq of gzip1Result.requests) {
    const gKB = gReq.transferSize / 1024;
    if (gKB < 0.5) continue; // skip tiny files

    const shortUrl = gReq.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '').slice(0, 43);
    const type = gReq.resourceType === 'script' ? 'JS' : 'CSS';

    let bestDelta = 0;
    const cols = [shortUrl.padEnd(45), type.padEnd(10), gKB.toFixed(1).padStart(8)];

    for (const zMode of zstdModes) {
      const zReq = zMode.requests.find(r => r.url === gReq.url);
      const zKB = zReq ? zReq.transferSize / 1024 : 0;
      cols.push(zKB.toFixed(1).padStart(8));
      const delta = gKB > 0 ? ((gKB - zKB) / gKB * 100) : 0;
      if (delta > bestDelta) bestDelta = delta;
    }

    cols.push(`-${bestDelta.toFixed(1)}%`.padStart(8));
    console.log(cols.join(' '));
  }
}

console.log(`\nBenchmark complete.`);
