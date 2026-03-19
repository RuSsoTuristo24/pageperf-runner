import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';

const runExecutor = vi.fn();
const authCapture = vi.fn();
const authValidate = vi.fn();

describe('multi-page run api', () => {
	let storageRoot = '';

	beforeEach(async () => {
		storageRoot = await mkdtemp(path.join(tmpdir(), 'webperf-api-multipage-'));
		runExecutor.mockReset();
		authCapture.mockReset();
		authValidate.mockReset();
		authValidate.mockResolvedValue(true);
	});

	afterEach(async () => {
		if (storageRoot)
		{
			await rm(storageRoot, { recursive: true, force: true });
		}
	});

	it('stores and returns multiple page results inside one run', async () => {
		const app = createApp({ runExecutor, authCapture, authValidate, storageRoot });

		runExecutor.mockResolvedValue({
			runId: 'ignored',
			status: 'completed',
			pageMetrics: [
				{ name: 'ttfb', value: 200 },
				{ name: 'fcp', value: 900 },
				{ name: 'load', value: 1600 },
			],
			requests: [
				{
					url: 'https://russeltest.bitrix24.ru/blank.php',
					method: 'GET',
					status: 200,
					resourceType: 'document',
					contentEncoding: 'gzip',
					fromDiskCache: false,
					fromMemoryCache: false,
					revalidated: false,
					transferSize: 1024,
					encodedBodySize: 900,
					decodedBodySize: 3000,
					durationMs: 200,
					startTimeMs: 0,
					endTimeMs: 200,
					queueingMs: 5,
					dnsMs: 10,
					connectMs: 20,
					sslMs: 15,
					requestSentMs: 2,
					waitingMs: 120,
					downloadMs: 28,
					initiatorType: 'parser',
					initiatorUrl: 'https://russeltest.bitrix24.ru/blank.php',
					protocol: 'h2',
					priority: 'High',
				},
			],
			traceSummary: {
				criticalChain: [],
				mainThread: {
					parse: 12,
					evaluate: 25,
					layout: 8,
					paint: 4,
					other: 3,
					longTaskCount: 1,
					longTaskTotal: 70,
				},
			},
			jsExecutionSummary: {
				resources: [
					{
						url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
						parseMs: 12,
						evaluateMs: 25,
						totalMs: 37,
						attributionConfidence: 'high',
					},
				],
				unattributed: {
					parseMs: 1,
					evaluateMs: 3,
					totalMs: 4,
				},
			},
			coverageSummary: {
				totals: {
					js: { usedBytes: 100, unusedBytes: 30 },
					css: { usedBytes: 10, unusedBytes: 5 },
				},
				resources: [],
			},
			pageDiagnostics: {
				dom: { nodeCount: 1200, treeDepth: 18, eventListenerCount: 150 },
				heap: { usedBytes: 15_000_000, totalBytes: 30_000_000 },
				oversizedImages: [
					{
						url: 'https://russeltest.bitrix24.ru/upload/hero.jpg',
						naturalWidth: 3000,
						naturalHeight: 2000,
						displayWidth: 600,
						displayHeight: 400,
						wastedPixels: 5_760_000,
						estimatedWastedBytes: 1_728_000,
					},
				],
				thirdParty: {
					origins: [
						{ origin: 'https://mc.yandex.ru', transferBytes: 42000, requestCount: 2, blockingTimeMs: 83 },
					],
					totalTransferBytes: 42000,
					totalRequests: 2,
				},
				renderBlocking: [],
				unusedPreloads: [],
				protocolDistribution: [],
			},
			passes: [
				{
					label: 'cold',
					pageMetrics: [
						{ name: 'ttfb', value: 200 },
						{ name: 'fcp', value: 900 },
						{ name: 'load', value: 1600 },
					],
					requests: [],
					jsExecutionSummary: {
						resources: [
							{
								url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
								parseMs: 12,
								evaluateMs: 25,
								totalMs: 37,
								attributionConfidence: 'high',
							},
						],
						unattributed: {
							parseMs: 1,
							evaluateMs: 3,
							totalMs: 4,
						},
					},
				},
			],
			pages: [
				{
					pageKey: 'https://russeltest.bitrix24.ru/blank.php',
					url: 'https://russeltest.bitrix24.ru/blank.php',
					pageMetrics: [
						{ name: 'ttfb', value: 200 },
						{ name: 'fcp', value: 900 },
						{ name: 'load', value: 1600 },
					],
					requests: [
						{
							url: 'https://russeltest.bitrix24.ru/blank.php',
							method: 'GET',
							status: 200,
							resourceType: 'document',
							contentEncoding: 'gzip',
							fromDiskCache: false,
							fromMemoryCache: false,
							revalidated: false,
							transferSize: 1024,
							encodedBodySize: 900,
							decodedBodySize: 3000,
							durationMs: 200,
							startTimeMs: 0,
							endTimeMs: 200,
							queueingMs: 5,
							dnsMs: 10,
							connectMs: 20,
							sslMs: 15,
							requestSentMs: 2,
							waitingMs: 120,
							downloadMs: 28,
							initiatorType: 'parser',
							initiatorUrl: 'https://russeltest.bitrix24.ru/blank.php',
							protocol: 'h2',
							priority: 'High',
						},
					],
					traceSummary: {
						criticalChain: [],
						mainThread: {
							parse: 12,
							evaluate: 25,
							layout: 8,
							paint: 4,
							other: 3,
							longTaskCount: 1,
							longTaskTotal: 70,
						},
					},
					jsExecutionSummary: {
						resources: [
							{
								url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
								parseMs: 12,
								evaluateMs: 25,
								totalMs: 37,
								attributionConfidence: 'high',
							},
						],
						unattributed: {
							parseMs: 1,
							evaluateMs: 3,
							totalMs: 4,
						},
					},
					coverageSummary: {
						totals: {
							js: { usedBytes: 100, unusedBytes: 30 },
							css: { usedBytes: 10, unusedBytes: 5 },
						},
						resources: [],
					},
					pageDiagnostics: {
						dom: { nodeCount: 1200, treeDepth: 18, eventListenerCount: 150 },
						heap: { usedBytes: 15_000_000, totalBytes: 30_000_000 },
						oversizedImages: [
							{
								url: 'https://russeltest.bitrix24.ru/upload/hero.jpg',
								naturalWidth: 3000,
								naturalHeight: 2000,
								displayWidth: 600,
								displayHeight: 400,
								wastedPixels: 5_760_000,
								estimatedWastedBytes: 1_728_000,
							},
						],
						thirdParty: {
							origins: [
								{ origin: 'https://mc.yandex.ru', transferBytes: 42000, requestCount: 2, blockingTimeMs: 83 },
							],
							totalTransferBytes: 42000,
							totalRequests: 2,
						},
						renderBlocking: [],
						unusedPreloads: [],
						protocolDistribution: [],
					},
					passes: [
						{
							label: 'cold',
							pageMetrics: [
								{ name: 'ttfb', value: 200 },
								{ name: 'fcp', value: 900 },
								{ name: 'load', value: 1600 },
							],
							requests: [],
							jsExecutionSummary: {
								resources: [
									{
										url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
										parseMs: 12,
										evaluateMs: 25,
										totalMs: 37,
										attributionConfidence: 'high',
									},
								],
								unattributed: {
									parseMs: 1,
									evaluateMs: 3,
									totalMs: 4,
								},
							},
						},
					],
				},
				{
					pageKey: 'https://russeltest.bitrix24.ru/crm/lead/list/',
					url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
					pageMetrics: [
						{ name: 'ttfb', value: 300 },
						{ name: 'fp', value: 1200 },
						{ name: 'fcp', value: 1400 },
						{ name: 'load', value: 2800 },
					],
					requests: [
						{
							url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
							method: 'GET',
							status: 200,
							resourceType: 'document',
							contentEncoding: 'gzip',
							fromDiskCache: false,
							fromMemoryCache: false,
							revalidated: false,
							transferSize: 2048,
							encodedBodySize: 1800,
							decodedBodySize: 7000,
							durationMs: 300,
							startTimeMs: 0,
							endTimeMs: 300,
							queueingMs: 10,
							dnsMs: 12,
							connectMs: 25,
							sslMs: 18,
							requestSentMs: 3,
							waitingMs: 190,
							downloadMs: 42,
							initiatorType: 'parser',
							initiatorUrl: 'https://russeltest.bitrix24.ru/crm/lead/list/',
							protocol: 'h2',
							priority: 'VeryHigh',
						},
					],
					traceSummary: {
						criticalChain: [],
						mainThread: {
							parse: 20,
							evaluate: 40,
							layout: 12,
							paint: 7,
							other: 5,
							longTaskCount: 2,
							longTaskTotal: 140,
						},
					},
					jsExecutionSummary: {
						resources: [
							{
								url: 'https://russeltest.bitrix24.ru/bitrix/js/crm/app.bundle.js',
								parseMs: 20,
								evaluateMs: 40,
								totalMs: 60,
								attributionConfidence: 'medium',
							},
						],
						unattributed: {
							parseMs: 2,
							evaluateMs: 6,
							totalMs: 8,
						},
					},
					coverageSummary: {
						totals: {
							js: { usedBytes: 200, unusedBytes: 50 },
							css: { usedBytes: 20, unusedBytes: 10 },
						},
						resources: [],
					},
					pageDiagnostics: {
						dom: { nodeCount: 2500, treeDepth: 22, eventListenerCount: 380 },
						heap: { usedBytes: 25_000_000, totalBytes: 40_000_000 },
						oversizedImages: [],
						thirdParty: { origins: [], totalTransferBytes: 0, totalRequests: 0 },
						renderBlocking: [],
						unusedPreloads: [],
						protocolDistribution: [],
					},
					passes: [
						{
							label: 'cold',
							pageMetrics: [
								{ name: 'ttfb', value: 300 },
								{ name: 'fp', value: 1200 },
								{ name: 'fcp', value: 1400 },
								{ name: 'load', value: 2800 },
							],
							requests: [],
							jsExecutionSummary: {
								resources: [
									{
										url: 'https://russeltest.bitrix24.ru/bitrix/js/crm/app.bundle.js',
										parseMs: 20,
										evaluateMs: 40,
										totalMs: 60,
										attributionConfidence: 'medium',
									},
								],
								unattributed: {
									parseMs: 2,
									evaluateMs: 6,
									totalMs: 8,
								},
							},
						},
					],
				},
			],
		});

		const profileResponse = await app.inject({
			method: 'POST',
			url: '/api/profiles',
			payload: {
				name: 'Bitrix pack',
				url: 'https://russeltest.bitrix24.ru/blank.php',
				pages: [
					'https://russeltest.bitrix24.ru/blank.php',
					'https://russeltest.bitrix24.ru/crm/lead/list/',
				],
				throttling: 'native',
			},
		});

		const runResponse = await app.inject({
			method: 'POST',
			url: '/api/runs',
			payload: {
				profileId: profileResponse.json().id,
			},
		});

		const startResponse = await app.inject({
			method: 'POST',
			url: `/api/runs/${runResponse.json().id}/start`,
		});

		expect(startResponse.statusCode).toBe(200);
		expect(startResponse.json()).toMatchObject({
			run: expect.objectContaining({
				id: runResponse.json().id,
				status: 'completed',
			}),
			pages: [
				expect.objectContaining({
					pageKey: 'https://russeltest.bitrix24.ru/blank.php',
					url: 'https://russeltest.bitrix24.ru/blank.php',
				}),
				expect.objectContaining({
					pageKey: 'https://russeltest.bitrix24.ru/crm/lead/list/',
					url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
				}),
			],
		});

		const detailsResponse = await app.inject({
			method: 'GET',
			url: `/api/runs/${runResponse.json().id}`,
		});
		const details = detailsResponse.json();

		expect(detailsResponse.statusCode).toBe(200);
		expect(details.pages).toHaveLength(2);
		expect(details.jsExecutionSummary).toMatchObject({
			resources: [
				{
					url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
					totalMs: 37,
					attributionConfidence: 'high',
				},
			],
			unattributed: {
				totalMs: 4,
			},
		});
		expect(details.requests[0]).toMatchObject({
			startTimeMs: 0,
			waitingMs: 120,
			initiatorType: 'parser',
			protocol: 'h2',
		});
		expect(details.pages[0]?.jsExecutionSummary?.resources[0]).toMatchObject({
			totalMs: 37,
			attributionConfidence: 'high',
		});
		expect(details.pages[0]?.requests[0]).toMatchObject({
			startTimeMs: 0,
			downloadMs: 28,
			initiatorType: 'parser',
			protocol: 'h2',
		});
		expect(details.pages[1]?.jsExecutionSummary?.resources[0]).toMatchObject({
			totalMs: 60,
			attributionConfidence: 'medium',
		});
		expect(details.pages[1]?.requests[0]).toMatchObject({
			startTimeMs: 0,
			waitingMs: 190,
			initiatorType: 'parser',
			priority: 'VeryHigh',
		});


		// Check pageDiagnostics is stored and returned
		expect(details.pageDiagnostics).toBeDefined();
		expect(details.pageDiagnostics?.dom.nodeCount).toBe(1200);
		expect(details.pageDiagnostics?.oversizedImages).toHaveLength(1);
		expect(details.pageDiagnostics?.oversizedImages[0]?.url).toBe('https://russeltest.bitrix24.ru/upload/hero.jpg');
		expect(details.pageDiagnostics?.thirdParty.totalRequests).toBe(2);

		// Check page-level pageDiagnostics
		expect(details.pages[0]?.pageDiagnostics?.dom.nodeCount).toBe(1200);
		expect(details.pages[1]?.pageDiagnostics?.dom.nodeCount).toBe(2500);
		await app.close();
	});

	it('deletes a run and removes it from the list', async () => {
		const app = createApp({ runExecutor, authCapture, authValidate, storageRoot });

		const profileResponse = await app.inject({
			method: 'POST',
			url: '/api/profiles',
			payload: {
				name: 'Delete me',
				url: 'https://russeltest.bitrix24.ru/blank.php',
				throttling: 'native',
			},
		});

		const runResponse = await app.inject({
			method: 'POST',
			url: '/api/runs',
			payload: {
				profileId: profileResponse.json().id,
			},
		});

		const deleteResponse = await app.inject({
			method: 'DELETE',
			url: `/api/runs/${runResponse.json().id}`,
		});

		expect(deleteResponse.statusCode).toBe(200);
		expect(deleteResponse.json()).toEqual({
			deleted: true,
			runId: runResponse.json().id,
		});

		const listResponse = await app.inject({
			method: 'GET',
			url: '/api/runs',
		});

		expect(listResponse.statusCode).toBe(200);
		expect(listResponse.json()).toEqual([]);

		await app.close();
	});
});
