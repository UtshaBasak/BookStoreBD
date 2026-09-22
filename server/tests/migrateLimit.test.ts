/**
 * PowerShell drops the `--` separator when it calls a native command, so
 * `npm run migrate:images -- --limit 10` arrives with no `--limit` at all and
 * the run quietly becomes an unlimited one. The env var is the way through
 * that, and these pin which source wins.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { parseLimit } from '../scripts/migrateImages.js';

afterEach(() => {
  delete process.env.MIGRATE_LIMIT;
});

describe('how many listings a run touches', () => {
  it('reads the flag', () => {
    expect(parseLimit(['--limit', '10'])).toBe(10);
  });

  it('falls back to the environment when the flag did not survive the shell', () => {
    process.env.MIGRATE_LIMIT = '25';
    expect(parseLimit([])).toBe(25);
  });

  it('prefers the flag when both are given', () => {
    process.env.MIGRATE_LIMIT = '25';
    expect(parseLimit(['--limit', '10'])).toBe(10);
  });

  it('is unlimited when neither is given', () => {
    expect(parseLimit([])).toBe(0);
  });

  it('ignores anything that is not a positive whole number', () => {
    process.env.MIGRATE_LIMIT = 'ten';
    expect(parseLimit([])).toBe(0);
    expect(parseLimit(['--limit', '-5'])).toBe(0);
    expect(parseLimit(['--limit', '2.5'])).toBe(0);
  });
});
