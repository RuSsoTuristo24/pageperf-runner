import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('asset issues workflow', () => {
  it('lets the user track an asset, inspect it in the Mantis Watch tab, and delete it', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/profiles') && method === 'GET')
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

      if (url.endsWith('/api/runs') && method === 'GET')
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

      if (url.endsWith('/api/auth/session') && method === 'GET')
      {
        return new Response(JSON.stringify({
          id: 'default',
          status: 'missing',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/asset-issues') && method === 'GET')
      {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/runs/run-1') && method === 'GET')
      {
        return new Response(JSON.stringify({
          run: {
            id: 'run-1',
            profileId: 'profile-1',
            status: 'completed',
          },
          pageMetrics: [
            { name: 'ttfb', value: 540 },
            { name: 'load', value: 1820 },
          ],
          requests: [
            {
              url: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js?1758801351763107',
              method: 'GET',
              resourceType: 'script',
              contentEncoding: 'gzip',
              transferSize: 65000,
              encodedBodySize: 64000,
              decodedBodySize: 210000,
              durationMs: 612.5,
            },
          ],
          artifacts: [],
          passes: [
            {
              label: 'cold',
              pageMetrics: [
                { name: 'ttfb', value: 540 },
                { name: 'load', value: 1820 },
              ],
              requests: [
                {
                  url: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js?1758801351763107',
                  method: 'GET',
                  resourceType: 'script',
                  contentEncoding: 'gzip',
                  transferSize: 65000,
                  encodedBodySize: 64000,
                  decodedBodySize: 210000,
                  durationMs: 612.5,
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/asset-issues') && method === 'POST')
      {
        expect(init?.body).toBe(JSON.stringify({
          assetUrl: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js?1758801351763107',
          resourceType: 'script',
          mantisUrl: 'https://mantis.local/view.php?id=777',
          status: 'open',
          note: '',
        }));

        return new Response(JSON.stringify({
          assetKey: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js',
          assetUrl: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js',
          resourceType: 'script',
          mantisUrl: 'https://mantis.local/view.php?id=777',
          status: 'open',
          note: '',
          createdAt: '2026-03-12T12:00:00.000Z',
          returnedAfterClose: false,
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/asset-issues') && method === 'DELETE')
      {
        expect(init?.body).toBe(JSON.stringify({
          assetKey: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js',
        }));

        return new Response(JSON.stringify({
          deleted: true,
          assetKey: 'https://auth2.bitrix24.net/bitrix/js/b24network/vue/animated-icon/dist/animated-icon.bundle.min.js',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Blank page native/i })).toBeTruthy();

    fireEvent.click(await screen.findByRole('tab', { name: /Ресурсы/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Отслеживать' }));

    fireEvent.change(await screen.findByLabelText('Mantis URL'), {
      target: { value: 'https://mantis.local/view.php?id=777' },
    });
    fireEvent.change(screen.getByLabelText('Статус'), {
      target: { value: 'open' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    fireEvent.click(await screen.findByRole('tab', { name: /Mantis/ }));

    expect(await screen.findByRole('heading', { name: 'Отслеживание' })).toBeTruthy();
    expect(await screen.findByText('https://mantis.local/view.php?id=777')).toBeTruthy();
    expect(await screen.findByText(/animated-icon\.bundle\.min\.js/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(screen.queryByText('https://mantis.local/view.php?id=777')).toBeNull();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/asset-issues', expect.objectContaining({
        method: 'POST',
      }));
      expect(fetchMock).toHaveBeenCalledWith('/api/asset-issues', expect.objectContaining({
        method: 'DELETE',
      }));
    });
  });
});
