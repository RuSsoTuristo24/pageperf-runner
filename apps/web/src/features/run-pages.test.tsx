import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../app.js';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200): Response
{
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('multi-page run UI', () => {
	it('switches between page results inside one run and deletes the run', async () => {
		fetchMock.mockImplementation(async (input, init) => {
			const url = String(input);
			const method = init?.method ?? 'GET';

			if (url.endsWith('/api/asset-issues') && method === 'GET')
			{
				return jsonResponse([]);
			}

			if (url.endsWith('/api/profiles') && method === 'GET')
			{
				return jsonResponse([
					{
						id: 'profile-1',
						name: 'Bitrix pack',
						url: 'https://russeltest.bitrix24.ru/blank.php',
						pages: [
							'https://russeltest.bitrix24.ru/blank.php',
							'https://russeltest.bitrix24.ru/crm/lead/list/',
						],
						throttling: 'native',
						authMode: 'none',
						cacheMode: 'cold',
					},
				]);
			}

			if (url.endsWith('/api/auth/sessions') && method === 'GET')
			{
				return jsonResponse([]);
			}

			if (url.endsWith('/api/runs') && method === 'GET')
			{
				return jsonResponse([
					{
						id: 'run-1',
						profileId: 'profile-1',
						status: 'completed',
					},
				]);
			}

			if (url.endsWith('/api/runs/run-1') && method === 'GET')
			{
				return jsonResponse({
					run: {
						id: 'run-1',
						profileId: 'profile-1',
						status: 'completed',
					},
					pageMetrics: [
						{ name: 'ttfb', value: 200 },
						{ name: 'fcp', value: 900 },
						{ name: 'load', value: 1600 },
					],
					requests: [
						{
							url: 'https://russeltest.bitrix24.ru/blank.php',
							method: 'GET',
							resourceType: 'document',
							contentEncoding: 'gzip',
							transferSize: 1024,
							encodedBodySize: 900,
							decodedBodySize: 3000,
							durationMs: 200,
						},
					],
					artifacts: [],
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
									resourceType: 'document',
									contentEncoding: 'gzip',
									transferSize: 1024,
									encodedBodySize: 900,
									decodedBodySize: 3000,
									durationMs: 200,
								},
							],
							traceSummary: {
								criticalChain: [],
								mainThread: {
									parse: 12,
									evaluate: 20,
									layout: 8,
									paint: 4,
									other: 3,
									longTaskCount: 1,
									longTaskTotal: 60,
								},
							},
							jsExecutionSummary: {
								resources: [
									{
										url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
										parseMs: 12,
										evaluateMs: 20,
										totalMs: 32,
										attributionConfidence: 'high',
									},
								],
								unattributed: {
									parseMs: 1,
									evaluateMs: 2,
									totalMs: 3,
								},
							},
							coverageSummary: {
								totals: {
									js: { usedBytes: 10, unusedBytes: 5 },
									css: { usedBytes: 2, unusedBytes: 1 },
								},
							},
							passes: [],
						},
						{
							pageKey: 'https://russeltest.bitrix24.ru/crm/lead/list/',
							url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
							pageMetrics: [
								{ name: 'ttfb', value: 300 },
								{ name: 'fp', value: 700 },
								{ name: 'fcp', value: 950 },
								{ name: 'lcp', value: 1350 },
								{ name: 'load', value: 2500 },
							],
							requests: [
								{
									url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
									method: 'GET',
									resourceType: 'document',
									contentEncoding: 'gzip',
									transferSize: 2048,
									encodedBodySize: 1800,
									decodedBodySize: 7000,
									durationMs: 300,
								},
								{
									url: 'https://russeltest.bitrix24.ru/bitrix/js/main/core/core.min.js',
									method: 'GET',
									resourceType: 'script',
									contentEncoding: 'gzip',
									transferSize: 50000,
									encodedBodySize: 40000,
									decodedBodySize: 150000,
									durationMs: 600,
								},
							],
							traceSummary: {
								criticalChain: [],
								mainThread: {
									parse: 22,
									evaluate: 48,
									layout: 14,
									paint: 6,
									other: 5,
									longTaskCount: 2,
									longTaskTotal: 130,
								},
							},
							jsExecutionSummary: {
								resources: [
									{
										url: 'https://russeltest.bitrix24.ru/bitrix/js/crm/app.bundle.js',
										parseMs: 22,
										evaluateMs: 48,
										totalMs: 70,
										attributionConfidence: 'medium',
									},
								],
								unattributed: {
									parseMs: 3,
									evaluateMs: 5,
									totalMs: 8,
								},
							},
							coverageSummary: {
								totals: {
									js: { usedBytes: 20, unusedBytes: 8 },
									css: { usedBytes: 3, unusedBytes: 1 },
								},
							},
							passes: [],
						},
					],
				});
			}

			if (url.endsWith('/api/runs/run-1') && method === 'DELETE')
			{
				return jsonResponse({
					deleted: true,
					runId: 'run-1',
				});
			}

			throw new Error(`Unexpected fetch ${method} ${url}`);
		});

		render(<App />);

		fireEvent.click(await screen.findByRole('tab', { name: /Обзор/ }));
		await screen.findByRole('heading', { name: 'Стадии загрузки' });
		await waitFor(() => {
			expect(screen.getByLabelText('Страница прогона')).toBeTruthy();
		});
		expect(screen.getByRole('option', { name: '/blank.php' })).toBeTruthy();

		fireEvent.change(screen.getByLabelText('Страница прогона'), {
			target: { value: 'https://russeltest.bitrix24.ru/crm/lead/list/' },
		});

		expect(await screen.findByText('2.50 с')).toBeTruthy();
		expect((await screen.findAllByText('1.35 с')).length).toBeGreaterThan(0);
		expect((await screen.findAllByText('/crm/lead/list/')).length).toBeGreaterThan(0);
		expect(screen.getByText('JS Eval')).toBeTruthy();
		fireEvent.click(screen.getByRole('tab', { name: /Анализ/ }));
		expect(screen.getByRole('heading', { name: 'JS Execution' })).toBeTruthy();
		expect(screen.getByText('/bitrix/js/crm/app.bundle.js')).toBeTruthy();
		expect(screen.getByText('medium')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Удалить прогон' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-1', expect.objectContaining({
				method: 'DELETE',
			}));
		});

		expect(await screen.findByText('Прогонов пока нет.')).toBeTruthy();
		expect(screen.queryByDisplayValue('https://russeltest.bitrix24.ru/crm/lead/list/')).toBeNull();

		const runList = screen.getByRole('region', { name: 'Прогоны' });
		expect(within(runList).queryByRole('button', { name: /Bitrix pack/i })).toBeNull();
	});
});
