import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no object URL support, and the image preview code calls it.
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-object-url');
  globalThis.URL.revokeObjectURL = vi.fn();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
