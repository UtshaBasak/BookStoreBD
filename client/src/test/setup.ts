import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom's object-URL support is not something to lean on: it was missing
// entirely in jsdom 29 and throws on any Blob in 30. Stubbed unconditionally
// rather than behind a feature check, which silently stopped applying the
// moment the broken implementation appeared. These tests are about what our
// code does with the URL, not about jsdom's blob store.
globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-object-url');
globalThis.URL.revokeObjectURL = vi.fn();

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
