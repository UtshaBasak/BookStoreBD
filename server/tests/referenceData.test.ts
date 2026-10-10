/**
 * The shop's fixed lists exist twice: in the website's code, so a page renders
 * without waiting for the API, and in the API, for the Android app. They must
 * never differ.
 */
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

import { describe, it, expect } from 'vitest';

import { CATEGORY_GROUPS, DELIVERY_DAYS, DELIVERY_DIVISIONS } from '../config/reference.js';
import { DELIVERY, RETURN_WINDOW_DAYS } from '../config/commerce.js';

const client = (file: string): string =>
  pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../../client/src/config', file)).href;

/** Loaded by address: the client is a separate package, outside the server's compilation. */
const load = async <T>(file: string): Promise<T> => (await import(client(file))) as T;

describe('reference data', () => {
  it('has the same categories as the website, in the same groups and order', async () => {
    const { CATEGORY_GROUPS: website } = await load<{ CATEGORY_GROUPS: unknown }>('categories.ts');
    expect(CATEGORY_GROUPS).toEqual(website);
  });

  it('has the same divisions and districts as the website checkout', async () => {
    const { DIVISIONS, DIVISION_DISTRICTS } = await load<{ DIVISIONS: string[]; DIVISION_DISTRICTS: Record<string, string[]> }>(
      'locations.ts'
    );
    expect(Object.keys(DELIVERY_DIVISIONS)).toEqual(DIVISIONS);
    expect(DELIVERY_DIVISIONS).toEqual(DIVISION_DISTRICTS);
  });

  it('quotes the same delivery charges, delivery days and return window as the website', async () => {
    const { site } = await load<{
      site: { delivery: Record<string, number>; returns: { windowDays: number } };
    }>('site.ts');
    expect(site.delivery).toEqual({
      insideDhaka: DELIVERY.insideDhaka,
      outsideDhaka: DELIVERY.outsideDhaka,
      daysInsideDhaka: DELIVERY_DAYS.insideDhaka,
      daysOutsideDhaka: DELIVERY_DAYS.outsideDhaka,
    });
    expect(site.returns.windowDays).toBe(RETURN_WINDOW_DAYS);
  });

  it('lists every district once, and Dhaka district inside Dhaka division', () => {
    const districts = Object.values(DELIVERY_DIVISIONS).flat();
    expect(new Set(districts).size).toBe(districts.length);
    expect(districts).toHaveLength(64);
    expect(DELIVERY_DIVISIONS.Dhaka).toContain('Dhaka');
  });
});
