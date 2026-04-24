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

function createEmptyAssetIssuesResponse(url: string, method = 'GET'): Response | null
{
  if (url.endsWith('/api/asset-issues') && method === 'GET')
  {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

function createDefaultConfigResponse(url: string, method = 'GET'): Response | null
{
  if (url.endsWith('/api/config') && method === 'GET')
  {
    return new Response(JSON.stringify({ vncUrl: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

describe('pageperf-runner app shell', () => {
  it('creates a profile and starts a new run from the UI', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url, method);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      const configResponse = createDefaultConfigResponse(url, method);

      if (configResponse)
      {
        return configResponse;
      }

      if (url.endsWith('/api/profiles') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/profiles') && method === 'POST')
      {
        expect(init?.body).toBe(JSON.stringify({
          name: 'Blank page scripted',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          pages: ['https://russeltest.bitrix24.ru/blank.php'],
          throttling: 'slow-4g',
          authMode: 'none',
          cacheMode: 'cold',
          environment: 'production',
          isTemplate: false,
        }));

        return new Response(JSON.stringify({
          id: 'profile-2',
          name: 'Blank page scripted',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          pages: ['https://russeltest.bitrix24.ru/blank.php'],
          throttling: 'slow-4g',
          authMode: 'none',
          cacheMode: 'cold',
          environment: 'production',
          isTemplate: false,
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'POST')
      {
        expect(init?.body).toBe(JSON.stringify({
          profileId: 'profile-2',
        }));

        return new Response(JSON.stringify({
          id: 'run-2',
          profileId: 'profile-2',
          status: 'queued',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-2/start') && method === 'POST')
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-2',
            profileId: 'profile-2',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 812.2 },
            { name: 'load', value: 1820.3 },
          ],
          requests: [
            {
              url: '/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 65000,
              encodedBodySize: 64000,
              decodedBodySize: 210000,
            },
          ],
          artifacts: [],
          passes: [
            {
              label: 'cold',
              pageMetrics: [
                { name: 'ttfb', value: 812.2 },
                { name: 'load', value: 1820.3 },
              ],
              requests: [
                {
                  url: '/blank.php',
                  method: 'GET',
                  resourceType: 'document',
                  contentEncoding: 'gzip',
                  transferSize: 65000,
                  encodedBodySize: 64000,
                  decodedBodySize: 210000,
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    expect(await screen.findByText('Прогонов пока нет.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Создать профиль' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Имя профиля'), {
      target: { value: 'Blank page scripted' },
    });
    fireEvent.change(screen.getByLabelText('URL профиля'), {
      target: { value: 'https://russeltest.bitrix24.ru/blank.php' },
    });
    fireEvent.change(screen.getByLabelText('Пресет сети'), {
      target: { value: 'slow-4g' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать и запустить' }));

    expect((await screen.findAllByText('Blank page scripted')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /Обзор/ }));
    expect(await screen.findByRole('heading', { name: 'Стадии загрузки' })).toBeTruthy();
    expect((await screen.findAllByText('812.2 мс')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('210.00 КБ')).length).toBeGreaterThan(0);
    expect(await screen.findByText('LOAD')).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profiles', expect.objectContaining({
        method: 'POST',
      }));
      expect(fetchMock).toHaveBeenCalledWith('/api/runs', expect.objectContaining({
        method: 'POST',
      }));
      expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-2/start', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('loads runs and selected run details from the API', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
            targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-2',
            profileId: 'profile-2',
            status: 'running',
          },
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-2'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-2',
            profileId: 'profile-2',
            status: 'running',
          },
          pageMetrics: [],
          requests: [],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 1698.5 },
            { name: 'fcp', value: 2948 },
            { name: 'load', value: 9438.4 },
          ],
          requests: [
            {
              url: '/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 1698.5,
            },
            {
              url: '/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 282000,
              encodedBodySize: 282000,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'pageperf-runner' }),
    ).toBeTruthy();

    expect(await screen.findByRole('button', { name: /Blank page native/i })).toBeTruthy();
    expect((await screen.findAllByText('275.27 КБ')).length).toBeGreaterThan(0);
    expect(await screen.findByText('call.bundle.min.js')).toBeTruthy();
    expect(await screen.findByText('/bitrix/js/call/core/dist/call.bundle.min.js')).toBeTruthy();
    expect(screen.queryByText('/bitrix/js/call/core/dist/call.bundle.min.js?177003277891665')).toBeNull();
    fireEvent.click(await screen.findByRole('tab', { name: /Обзор/ }));
    expect(await screen.findByRole('heading', { name: 'Стадии загрузки' })).toBeTruthy();
    expect(await screen.findByText('От навигации до полной загрузки')).toBeTruthy();
    expect((await screen.findAllByText('1.70 с')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('2.95 с')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('9.44 с')).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Что такое TTFB?')).toBeTruthy();
    expect(await screen.findByRole('tab', { name: /Ресурсы/ })).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profiles');
      expect(fetchMock).toHaveBeenCalledWith('/api/runs');
      expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-1');
      expect(fetchMock).not.toHaveBeenCalledWith('/api/runs/run-2');
    });
  });

  it('renders legacy trace summaries without crashing the app shell', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Legacy trace run',
            url: 'https://example.com',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 100 },
            { name: 'load', value: 200 },
          ],
          requests: [],
          artifacts: [],
          traceSummary: {
            criticalChain: [],
            mainThread: {
              script: 44.5,
              layout: 6,
              paint: 2,
              other: 1,
            },
          },
          passes: [
            {
              label: 'cold',
              pageMetrics: [
                { name: 'ttfb', value: 100 },
                { name: 'load', value: 200 },
              ],
              requests: [],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Обзор/ }));
    expect(await screen.findByRole('heading', { name: 'Стадии загрузки' })).toBeTruthy();
    expect((await screen.findAllByText('Legacy trace run')).length).toBeGreaterThan(0);
    expect(await screen.findByText('JS Eval')).toBeTruthy();
    expect(await screen.findByText('44.5 мс')).toBeTruthy();
  });

  it('generates an LLM report for the selected run from the overview', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
            cacheMode: 'cold',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 553.8 },
            { name: 'fcp', value: 1952 },
            { name: 'load', value: 3566.4 },
          ],
          requests: [
            {
              url: '/bitrix/js/call/core/dist/call.bundle.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 282000,
              encodedBodySize: 281700,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
          ],
          artifacts: [],
          passes: [
            {
              label: 'cold',
              pageMetrics: [
                { name: 'ttfb', value: 553.8 },
                { name: 'fcp', value: 1952 },
                { name: 'load', value: 3566.4 },
              ],
              requests: [
                {
                  url: '/bitrix/js/call/core/dist/call.bundle.min.js',
                  method: 'GET',
                  resourceType: 'script',
                  contentEncoding: 'gzip',
                  transferSize: 282000,
                  encodedBodySize: 281700,
                  decodedBodySize: 1119000,
                  durationMs: 281.7,
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/runs/run-1/llm-report'))
      {
        return new Response(JSON.stringify({
          runId: 'run-1',
          passLabel: 'cold',
          format: 'markdown',
          content: '# pageperf-runner LLM Report\n\n## Heavy Assets\n- call.bundle.min.js',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Обзор/ }));
    await screen.findByRole('heading', { name: 'Стадии загрузки' });
    fireEvent.click(screen.getByRole('button', { name: 'Сформировать LLM-отчёт' }));

    expect(await screen.findByRole('heading', { name: 'LLM Report' })).toBeTruthy();
    expect(await screen.findByDisplayValue(/# pageperf-runner LLM Report/)).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/runs/run-1/llm-report'));
    });
  });

  it('filters requests by resource type after loading live data', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [],
          requests: [
            {
              url: '/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 1698.5,
            },
            {
              url: '/bitrix/js/call/core/dist/call.bundle.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 282000,
              encodedBodySize: 282000,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Запросы/ }));
    await screen.findByRole('heading', { name: 'Запросы' });
    await screen.findByText('/bitrix/js/call/core/dist/call.bundle.min.js');

    fireEvent.change(screen.getByLabelText('Тип запроса'), {
      target: { value: 'script' },
    });

    const requestTable = screen.getByRole('table', { name: 'Requests table' });
    const rows = within(requestTable).getAllByRole('row');

    expect(rows).toHaveLength(2);
    expect(within(requestTable).getByText('js')).toBeTruthy();
    expect(within(requestTable).queryByText('document')).toBeNull();
  });

  it('shows request waterfall details and network initiator metadata', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Waterfall profile',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 400 },
            { name: 'load', value: 1200 },
          ],
          requests: [
            {
              url: 'https://russeltest.bitrix24.ru/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 220,
              startTimeMs: 0,
              endTimeMs: 220,
              queueingMs: 5,
              dnsMs: 10,
              connectMs: 20,
              sslMs: 15,
              requestSentMs: 2,
              waitingMs: 150,
              downloadMs: 18,
              initiatorType: 'parser',
              initiatorUrl: 'https://russeltest.bitrix24.ru/blank.php',
              protocol: 'h2',
              priority: 'High',
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Запросы/ }));
    expect(await screen.findByRole('heading', { name: 'Waterfall' })).toBeTruthy();
    expect(await screen.findByText('parser')).toBeTruthy();
    expect(await screen.findByText('h2')).toBeTruthy();
    expect(await screen.findByText('Queue 5.0 мс')).toBeTruthy();
    expect(await screen.findByLabelText('Waterfall row /blank.php')).toBeTruthy();
  });

  it('shows js execution attribution with confidence badges and unattributed bucket', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Execution profile',
            url: 'https://russeltest.bitrix24.ru/crm/lead/list/',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 400 },
            { name: 'load', value: 1200 },
          ],
          requests: [],
          artifacts: [],
          jsExecutionSummary: {
            resources: [
              {
                url: 'https://russeltest.bitrix24.ru/bitrix/js/crm/app.bundle.js',
                parseMs: 20,
                evaluateMs: 48,
                totalMs: 68,
                attributionConfidence: 'high',
              },
            ],
            unattributed: {
              parseMs: 4,
              evaluateMs: 8,
              totalMs: 12,
            },
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Анализ/ }));
    expect(await screen.findByRole('heading', { name: 'JS Execution' })).toBeTruthy();
    expect(await screen.findByText('high')).toBeTruthy();
    expect(await screen.findByText('не атрибутировано')).toBeTruthy();
    expect(await screen.findByText('68.0 мс')).toBeTruthy();
    expect(await screen.findByText('/bitrix/js/crm/app.bundle.js')).toBeTruthy();
  });

  it('sorts requests by header click and hides optional columns', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [],
          requests: [
            {
              url: '/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 1698.5,
            },
            {
              url: '/bitrix/js/main/core/core.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 84000,
              encodedBodySize: 80000,
              decodedBodySize: 245600,
              durationMs: 281.7,
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Запросы/ }));
    const requestTable = await screen.findByRole('table', { name: 'Requests table' });
    await screen.findByText('/bitrix/js/main/core/core.min.js');
    expect(within(requestTable).getByText('Transfer')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Dur/ }));

    let rows = within(requestTable).getAllByRole('row');
    expect(within(rows[1]).getByText('/blank.php')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Transfer'));
    expect(within(requestTable).queryByText('Transfer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Dur/ }));
    rows = within(requestTable).getAllByRole('row');
    expect(within(rows[1]).getByText('/bitrix/js/main/core/core.min.js')).toBeTruthy();
  });

  it('switches to the assets view and filters assets by type', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [],
          requests: [
            {
              url: '/blank.php',
              method: 'GET',
              resourceType: 'document',
              contentEncoding: 'gzip',
              transferSize: 70003,
              encodedBodySize: 69703,
              decodedBodySize: 275275,
              durationMs: 1698.5,
            },
            {
              url: '/bitrix/js/call/core/dist/call.bundle.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 282000,
              encodedBodySize: 282000,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
            {
              url: '/bitrix/cache/main.bundle.css',
              method: 'GET',
              resourceType: 'stylesheet',
              contentEncoding: 'gzip',
              transferSize: 12000,
              encodedBodySize: 10000,
              decodedBodySize: 42000,
              durationMs: 92.4,
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    await screen.findByRole('tab', { name: /Ресурсы/ });
    fireEvent.click(screen.getByRole('tab', { name: /Ресурсы/ }));

    const assetType = await screen.findByLabelText('Тип ресурса');
    fireEvent.change(assetType, {
      target: { value: 'script' },
    });

    const assetTable = screen.getByRole('table', { name: 'Assets table' });
    expect(within(assetTable).getByText('/bitrix/js/call/core/dist/call.bundle.min.js')).toBeTruthy();
    expect(within(assetTable).queryByText('/bitrix/cache/main.bundle.css')).toBeNull();
    expect(within(assetTable).getByText('281.7 мс')).toBeTruthy();
    expect(within(assetTable).getByText('3.97x')).toBeTruthy();
    expect(within(assetTable).getByText('js')).toBeTruthy();
  });

  it('sorts assets and highlights heavy decoded payloads', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [],
          requests: [
            {
              url: '/bitrix/js/call/core/dist/call.bundle.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 282000,
              encodedBodySize: 282000,
              decodedBodySize: 1119000,
              durationMs: 281.7,
            },
            {
              url: '/bitrix/js/main/core/core.min.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 98000,
              encodedBodySize: 84000,
              decodedBodySize: 245600,
              durationMs: 841.2,
            },
            {
              url: '/bitrix/cache/main.bundle.css',
              method: 'GET',
              resourceType: 'stylesheet',
              contentEncoding: 'gzip',
              transferSize: 12000,
              encodedBodySize: 10000,
              decodedBodySize: 42000,
              durationMs: 92.4,
            },
          ],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Ресурсы/ }));

    expect(await screen.findByLabelText('Порог decoded (МБ)')).toBeTruthy();
    expect(screen.getAllByText('> 1.00 МБ').length).toBeGreaterThan(0);

    const assetTable = screen.getByRole('table', { name: 'Assets table' });
    let rows = within(assetTable).getAllByRole('row');
    expect(within(assetTable).getAllByText('> 1.00 МБ').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Dur/ }));

    rows = within(assetTable).getAllByRole('row');
    expect(within(rows[1]).getByText('/bitrix/js/main/core/core.min.js')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Порог decoded (МБ)'), {
      target: { value: '2' },
    });

    expect(screen.getByText('> 2.00 МБ')).toBeTruthy();
    expect(screen.queryAllByText('> 1.00 МБ')).toHaveLength(0);
    expect(within(rows[1]).queryByText('> 1.00 МБ')).toBeNull();
    expect(screen.getByRole('button', { name: /Comp/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exp/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dur/ })).toBeTruthy();
  });

  it('shows an error state when the API bootstrap fails', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    render(<App />);

    expect(await screen.findByText('Не удалось загрузить данные pageperf-runner.')).toBeTruthy();
  });

  it('shows stage placeholders when a run has no page metrics yet', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page native',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'running',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'running',
          },
          pageMetrics: [],
          requests: [],
          artifacts: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: /Обзор/ }));
    expect(await screen.findByRole('heading', { name: 'Стадии загрузки' })).toBeTruthy();
    expect((await screen.findAllByText('Ожидание')).length).toBeGreaterThanOrEqual(6);
  });

  it('adds a new login and captures a per-host session from the UI', async () => {
    let hasCaptured = false;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url, method);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      const configResponse = createDefaultConfigResponse(url, method);

      if (configResponse)
      {
        return configResponse;
      }

      if (url.endsWith('/api/profiles') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions') && method === 'GET')
      {
        const payload = hasCaptured
          ? [{
            host: 'portal.bitrix24.com',
            status: 'ready',
            targetUrl: 'https://portal.bitrix24.com/',
          }]
          : [];

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions/capture') && method === 'POST')
      {
        expect(init?.body).toBe(JSON.stringify({
          targetUrl: 'https://portal.bitrix24.com/',
        }));

        hasCaptured = true;

        return new Response(JSON.stringify({
          host: 'portal.bitrix24.com',
          status: 'ready',
          targetUrl: 'https://portal.bitrix24.com/',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    expect(await screen.findByText('Нет сохранённых сессий.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Добавить вход/ }));

    fireEvent.change(screen.getByLabelText('URL для входа'), {
      target: { value: 'https://portal.bitrix24.com/' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Открыть окно входа' }));

    expect(await screen.findByText('Сессия готова', { exact: false })).toBeTruthy();
    expect(await screen.findByText('portal.bitrix24.com')).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/sessions/capture', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('shows the API auth error when an authenticated run cannot start', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url, method);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      const configResponse = createDefaultConfigResponse(url, method);

      if (configResponse)
      {
        return configResponse;
      }

      if (url.endsWith('/api/profiles') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions') && method === 'GET')
      {
        return new Response(JSON.stringify([
          {
            host: 'russeltest.bitrix24.ru',
            status: 'ready',
            targetUrl: 'https://russeltest.bitrix24.ru/blank.php',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/profiles') && method === 'POST')
      {
        return new Response(JSON.stringify({
          id: 'profile-2',
          name: 'Blank page scripted',
          url: 'https://russeltest.bitrix24.ru/blank.php',
          throttling: 'native',
          authMode: 'session',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'POST')
      {
        return new Response(JSON.stringify({
          id: 'run-2',
          profileId: 'profile-2',
          status: 'queued',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-2/start') && method === 'POST')
      {
        return new Response(JSON.stringify({
          error: 'Saved auth session is no longer valid. Capture it again.',
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    await screen.findByText('Сессия готова');
    fireEvent.click(screen.getByLabelText('Использовать сохранённую сессию'));
    fireEvent.click(screen.getByRole('button', { name: 'Создать и запустить' }));

    expect(await screen.findByText('Saved auth session is no longer valid. Capture it again.')).toBeTruthy();
  });

  it('switches between cold and warm passes when a run stores both', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      if (url.endsWith('/api/profiles'))
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-1',
            name: 'Blank page both cache',
            url: 'https://russeltest.bitrix24.ru/blank.php',
            throttling: 'native',
            authMode: 'none',
            cacheMode: 'both',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/auth/sessions'))
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs'))
      {
        return new Response(JSON.stringify([
          {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1'))
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 1000 },
            { name: 'load', value: 4000 },
          ],
          requests: [
            {
              url: '/cold.js',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 120000,
              encodedBodySize: 110000,
              decodedBodySize: 300000,
              durationMs: 400,
            },
          ],
          artifacts: [],
          passes: [
            {
              label: 'cold',
              pageMetrics: [
                { name: 'ttfb', value: 1000 },
                { name: 'load', value: 4000 },
              ],
              requests: [
                {
                  url: '/cold.js',
                  method: 'GET',
                  resourceType: 'script',
                  contentEncoding: 'gzip',
                  transferSize: 120000,
                  encodedBodySize: 110000,
                  decodedBodySize: 300000,
                  durationMs: 400,
                },
              ],
            },
            {
              label: 'warm',
              pageMetrics: [
                { name: 'ttfb', value: 200 },
                { name: 'load', value: 900 },
              ],
              requests: [
                {
                  url: '/warm.js',
                  method: 'GET',
                  resourceType: 'script',
                  contentEncoding: 'gzip',
                  transferSize: 0,
                  encodedBodySize: 0,
                  decodedBodySize: 300000,
                  durationMs: 120,
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    expect(await screen.findByText('/cold.js')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Обзор/ }));
    expect(await screen.findByRole('tab', { name: 'холодный' })).toBeTruthy();
    expect(screen.getByText('4.00 с')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'тёплый' }));

    expect(await screen.findByText('900.0 мс')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Запросы/ }));
    expect(await screen.findByText('/warm.js')).toBeTruthy();
  });

  it('starts a new run from an existing template without recreating the profile', async () => {
    const createProfileSpy = vi.fn();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url, method);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      const configResponse = createDefaultConfigResponse(url, method);

      if (configResponse)
      {
        return configResponse;
      }

      if (url.endsWith('/api/profiles') && method === 'GET')
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-template',
            name: 'Portal template',
            url: 'https://portal.example.com/',
            throttling: 'native',
            authMode: 'none',
            cacheMode: 'cold',
            isTemplate: true,
          },
          {
            id: 'profile-adhoc',
            name: 'Ad-hoc run',
            url: 'https://one-off.example.com/',
            throttling: 'native',
            authMode: 'none',
            cacheMode: 'cold',
            isTemplate: false,
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/profiles') && method === 'POST')
      {
        createProfileSpy();

        return new Response('{}', { status: 201 });
      }

      if (url.endsWith('/api/runs') && method === 'GET')
      {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/api/auth/sessions') && method === 'GET')
      {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/api/runs') && method === 'POST')
      {
        expect(init?.body).toBe(JSON.stringify({ profileId: 'profile-template' }));

        return new Response(JSON.stringify({
          id: 'run-from-template',
          profileId: 'profile-template',
          status: 'queued',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-from-template/start') && method === 'POST')
      {
        return new Response(JSON.stringify({
          run: { id: 'run-from-template', profileId: 'profile-template', status: 'completed' },
          pageMetrics: [],
          requests: [],
          artifacts: [],
          passes: [],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Запустить по шаблону' })).toBeTruthy();

    // Sidebar now has a single "Open list" button that launches the templates dialog.
    fireEvent.click(await screen.findByRole('button', { name: /Открыть список/ }));

    const listbox = await screen.findByLabelText('Список шаблонов');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('Portal template');
    expect(options[0]?.textContent).toContain('portal.example.com');

    fireEvent.click(options[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/runs', expect.objectContaining({ method: 'POST' }));
      expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-from-template/start', expect.objectContaining({ method: 'POST' }));
    });

    expect(createProfileSpy).not.toHaveBeenCalled();
  });

  it('promotes an ad-hoc profile to template from the workspace header', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const assetIssuesResponse = createEmptyAssetIssuesResponse(url, method);

      if (assetIssuesResponse)
      {
        return assetIssuesResponse;
      }

      const configResponse = createDefaultConfigResponse(url, method);

      if (configResponse)
      {
        return configResponse;
      }

      if (url.endsWith('/api/profiles') && method === 'GET')
      {
        return new Response(JSON.stringify([
          {
            id: 'profile-x',
            name: 'Ad-hoc profile',
            url: 'https://example.com/',
            throttling: 'native',
            authMode: 'none',
            cacheMode: 'cold',
            isTemplate: false,
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs') && method === 'GET')
      {
        return new Response(JSON.stringify([
          { id: 'run-x', profileId: 'profile-x', status: 'completed' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/api/auth/sessions') && method === 'GET')
      {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/api/runs/run-x') && method === 'GET')
      {
        return new Response(JSON.stringify({
          run: { id: 'run-x', profileId: 'profile-x', status: 'completed' },
          pageMetrics: [],
          requests: [],
          artifacts: [],
          passes: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/api/profiles/profile-x/template') && method === 'PATCH')
      {
        expect(init?.body).toBe(JSON.stringify({ isTemplate: true }));

        return new Response(JSON.stringify({
          id: 'profile-x',
          name: 'Ad-hoc profile',
          url: 'https://example.com/',
          throttling: 'native',
          authMode: 'none',
          cacheMode: 'cold',
          isTemplate: true,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    const promoteButton = await screen.findByRole('button', { name: 'Сохранить как шаблон' });
    fireEvent.click(promoteButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/profiles/profile-x/template',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
