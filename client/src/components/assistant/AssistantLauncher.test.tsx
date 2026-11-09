import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AssistantLauncher from './AssistantLauncher.js';

const config = (enabled: boolean) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify({ enabled }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  );

const mount = (path = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AssistantLauncher />
      </MemoryRouter>
    </QueryClientProvider>
  );

/** An idle callback that fires at once. */
const idleNow = () =>
  vi.stubGlobal('requestIdleCallback', (work: () => void) => {
    work();
    return 1;
  });

const settle = () => new Promise((done) => setTimeout(done, 30));

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('the assistant launcher', () => {
  it('renders nothing when the assistant is off', async () => {
    const fetchMock = config(false);
    vi.stubGlobal('fetch', fetchMock);
    idleNow();
    mount();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the button when it is on', async () => {
    vi.stubGlobal('fetch', config(true));
    idleNow();
    mount();
    expect(await screen.findByRole('button', { name: 'Ask the BookStoreBD assistant' })).toBeInTheDocument();
  });

  it('stays out of the admin panel', async () => {
    const fetchMock = config(true);
    vi.stubGlobal('fetch', fetchMock);
    idleNow();
    mount('/admin/analytics');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks nothing until the page is idle', async () => {
    const fetchMock = config(true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestIdleCallback', () => 1);
    mount();
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('lazy loading', () => {
  it('never imports the panel statically', () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
    const staticImport = /^\s*import\s[^;]*from\s+['"][^'"]*AssistantPanel[^'"]*['"]/m;
    expect(read('src/App.tsx')).not.toMatch(staticImport);
    const launcher = read('src/components/assistant/AssistantLauncher.tsx');
    expect(launcher).not.toMatch(staticImport);
    expect(launcher).toMatch(/import\(\s*['"]\.\/AssistantPanel\.js['"]\s*\)/);
  });
});
