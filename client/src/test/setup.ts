import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom's object-URL support varies by version (absent in 29, throws on any
// Blob in 30), so it is stubbed unconditionally rather than behind a feature
// check. These tests cover what the code does with the URL, not jsdom's blob
// store.
globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-object-url');
globalThis.URL.revokeObjectURL = vi.fn();

beforeEach(() => {
  localStorage.clear();
  // Most tests are about something other than the storage consent, so the
  // visitor has accepted it; the consent tests clear this themselves.
  localStorage.setItem('consent', JSON.stringify({ version: 1, at: '', preferences: true, personalisation: true, diagnostics: true }));
});

afterEach(() => {
  cleanup();
});
