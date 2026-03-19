import { describe, expect, it } from 'vitest';

import {
	buildOversizedImageScript,
	buildProtocolDistribution,
	buildRenderBlockingList,
	buildThirdPartySummary,
	buildUnusedPreloadList,
	summarizePageDiagnostics,
} from './page-diagnostics-collector.js';

describe('page diagnostics collector', () => {
	it('summarizes DOM stats and heap metrics from raw input', () => {
		const summary = summarizePageDiagnostics({
			domNodeCount: 1847,
			domTreeDepth: 24,
			eventListenerCount: 312,
			jsHeapUsedBytes: 18_400_000,
			jsHeapTotalBytes: 32_000_000,
		});

		expect(summary).toEqual({
			dom: {
				nodeCount: 1847,
				treeDepth: 24,
				eventListenerCount: 312,
			},
			heap: {
				usedBytes: 18_400_000,
				totalBytes: 32_000_000,
			},
			oversizedImages: [],
			thirdParty: { origins: [], totalTransferBytes: 0, totalRequests: 0 },
			renderBlocking: [],
			unusedPreloads: [],
			protocolDistribution: [],
		});
	});

	it('returns safe defaults when input fields are missing', () => {
		const summary = summarizePageDiagnostics({});

		expect(summary).toEqual({
			dom: {
				nodeCount: 0,
				treeDepth: 0,
				eventListenerCount: 0,
			},
			heap: {
				usedBytes: 0,
				totalBytes: 0,
			},
			oversizedImages: [],
			thirdParty: { origins: [], totalTransferBytes: 0, totalRequests: 0 },
			renderBlocking: [],
			unusedPreloads: [],
			protocolDistribution: [],
		});
	});

	it('clamps negative and non-finite numbers to zero', () => {
		const summary = summarizePageDiagnostics({
			domNodeCount: -5,
			domTreeDepth: NaN,
			eventListenerCount: Infinity,
			jsHeapUsedBytes: -1,
			jsHeapTotalBytes: Number.NEGATIVE_INFINITY,
		});

		expect(summary.dom).toEqual({
			nodeCount: 0,
			treeDepth: 0,
			eventListenerCount: 0,
		});
		expect(summary.heap).toEqual({
			usedBytes: 0,
			totalBytes: 0,
		});
	});

	it('passes through oversized images and third-party summary when provided', () => {
		const summary = summarizePageDiagnostics({
			domNodeCount: 500,
			oversizedImages: [
				{
					url: 'https://example.com/hero.png',
					naturalWidth: 3000,
					naturalHeight: 2000,
					displayWidth: 300,
					displayHeight: 200,
					wastedPixels: 5_910_000,
					estimatedWastedBytes: 1_200_000,
				},
			],
			thirdParty: {
				origins: [
					{
						origin: 'https://cdn.example.com',
						transferBytes: 450_000,
						requestCount: 12,
						blockingTimeMs: 120,
					},
				],
				totalTransferBytes: 450_000,
				totalRequests: 12,
			},
		});

		expect(summary.oversizedImages).toHaveLength(1);
		expect(summary.oversizedImages[0].url).toBe('https://example.com/hero.png');
		expect(summary.thirdParty.origins).toHaveLength(1);
		expect(summary.thirdParty.totalTransferBytes).toBe(450_000);
		expect(summary.thirdParty.totalRequests).toBe(12);
	});

	it('detects oversized images with wasted pixel and byte estimates', () =>
	{
		const summary = summarizePageDiagnostics({
			domNodeCount: 100,
			domTreeDepth: 10,
			eventListenerCount: 5,
			jsHeapUsedBytes: 1_000_000,
			jsHeapTotalBytes: 2_000_000,
			oversizedImages: [
				{
					url: 'https://cdn.example.com/photo.jpg',
					naturalWidth: 2000,
					naturalHeight: 1500,
					displayWidth: 400,
					displayHeight: 300,
					wastedPixels: 2_880_000,
					estimatedWastedBytes: 864_000,
				},
			],
		});

		expect(summary.oversizedImages).toEqual([
			{
				url: 'https://cdn.example.com/photo.jpg',
				naturalWidth: 2000,
				naturalHeight: 1500,
				displayWidth: 400,
				displayHeight: 300,
				wastedPixels: 2_880_000,
				estimatedWastedBytes: 864_000,
			},
		]);
	});

	it('builds an oversized images detection script', () =>
	{
		const script = buildOversizedImageScript();
		expect(script).toContain('naturalWidth');
		expect(script).toContain('clientWidth');
		expect(typeof script).toBe('string');
	});

	it('identifies render-blocking resources before FCP', () => {
		const result = buildRenderBlockingList({
			requests: [
				{ url: 'https://example.com/style.css', resourceType: 'stylesheet', durationMs: 100, transferSize: 5000, initiatorType: 'parser', startTimeMs: 0 },
				{ url: 'https://example.com/app.js', resourceType: 'script', durationMs: 200, transferSize: 10000, initiatorType: 'parser', startTimeMs: 50 },
				{ url: 'https://example.com/lazy.js', resourceType: 'script', durationMs: 150, transferSize: 8000, initiatorType: 'script', startTimeMs: 500 },
				{ url: 'https://example.com/image.png', resourceType: 'image', durationMs: 300, transferSize: 50000, initiatorType: 'parser', startTimeMs: 0 },
			],
			fcpMs: 900,
		});

		expect(result).toEqual([
			{ url: 'https://example.com/app.js', resourceType: 'script', durationMs: 200, transferBytes: 10000 },
			{ url: 'https://example.com/style.css', resourceType: 'stylesheet', durationMs: 100, transferBytes: 5000 },
		]);
	});

	it('builds protocol distribution from requests', () => {
		const result = buildProtocolDistribution({
			requests: [
				{ protocol: 'h2', transferSize: 1000 },
				{ protocol: 'h2', transferSize: 2000 },
				{ protocol: 'http/1.1', transferSize: 500 },
				{ transferSize: 100 },
			],
		});

		expect(result).toEqual([
			{ protocol: 'h2', requestCount: 2, transferBytes: 3000 },
			{ protocol: 'http/1.1', requestCount: 1, transferBytes: 500 },
			{ protocol: 'unknown', requestCount: 1, transferBytes: 100 },
		]);
	});

	it('finds unused preloaded resources', () => {
		const result = buildUnusedPreloadList({
			preloadedUrls: [
				'https://example.com/font.woff2',
				'https://example.com/hero.jpg',
				'https://example.com/app.js',
			],
			requestUrls: [
				'https://example.com/app.js',
				'https://example.com/style.css',
			],
		});

		expect(result).toEqual([
			'https://example.com/font.woff2',
			'https://example.com/hero.jpg',
		]);
	});

	it('calculates third-party impact grouped by origin', () =>
	{
		const result = buildThirdPartySummary({
			targetOrigin: 'https://russeltest.bitrix24.ru',
			requests: [
				{ url: 'https://russeltest.bitrix24.ru/blank.php', transferSize: 5000 },
				{ url: 'https://mc.yandex.ru/metrika/tag.js', transferSize: 30000 },
				{ url: 'https://mc.yandex.ru/metrika/watch.js', transferSize: 12000 },
				{ url: 'https://www.googletagmanager.com/gtm.js?id=X', transferSize: 80000 },
			],
			jsExecutionResources: [
				{ url: 'https://mc.yandex.ru/metrika/tag.js', totalMs: 83 },
				{ url: 'https://www.googletagmanager.com/gtm.js?id=X', totalMs: 45 },
			],
		});

		expect(result.origins).toHaveLength(2);
		expect(result.origins[0]).toEqual({
			origin: 'https://www.googletagmanager.com',
			transferBytes: 80000,
			requestCount: 1,
			blockingTimeMs: 45,
		});
		expect(result.origins[1]).toEqual({
			origin: 'https://mc.yandex.ru',
			transferBytes: 42000,
			requestCount: 2,
			blockingTimeMs: 83,
		});
		expect(result.totalTransferBytes).toBe(122000);
		expect(result.totalRequests).toBe(3);
	});
});
