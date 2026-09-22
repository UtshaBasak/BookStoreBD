import { describe, expect, it } from 'vitest';

import {
  ApiRequestError,
  apiErrorMessage,
  fieldLabel,
  messageOf,
  statusOf,
  validationSummary,
} from './apiError.js';

const rejected = (errors: { path: string; message: string }[]) => ({
  response: { data: { message: 'Validation failed', errors } },
});

describe('what a rejected form is told', () => {
  it('names the field, not just that something was wrong', () => {
    // "Submission failed: Validation failed" was the whole of it before.
    expect(apiErrorMessage(rejected([{ path: 'body.pages', message: 'Invalid input' }]))).toBe(
      'please check Pages (invalid input)'
    );
  });

  it('names all of them', () => {
    expect(
      validationSummary(
        rejected([
          { path: 'body.title', message: 'Title is required' },
          { path: 'body.conditionDetails', message: 'Too long' },
        ])
      )
    ).toBe('Title (title is required), Condition details (too long)');
  });

  it('reads a field name the way the form does', () => {
    expect(fieldLabel('body.bookType')).toBe('Book type');
    expect(fieldLabel('body.category.0')).toBe('0');
    expect(fieldLabel('isbn')).toBe('Isbn');
  });
});

describe('when the server did not name a field', () => {
  it('uses its message', () => {
    expect(apiErrorMessage({ response: { data: { message: 'Book not found' } } })).toBe(
      'Book not found'
    );
  });

  it('falls back when the request never got there', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'Could not reach the server')).toBe(
      'Could not reach the server'
    );
  });
});

describe('a failure thrown rather than returned', () => {
  it('keeps the status, so a caller can branch on it', () => {
    expect(statusOf(new ApiRequestError('Forbidden', 403))).toBe(403);
    expect(statusOf(new Error('offline'))).toBe(0);
  });

  it('reads a message off anything', () => {
    expect(messageOf(new Error('offline'))).toBe('offline');
    expect(messageOf('a string someone threw')).toBe('a string someone threw');
  });
});
