import { describe, expect, it } from 'vitest';

import { passwordProblems, passwordReady } from './passwordPolicy.js';

// The same cases as server/tests/alertsAndAccounts.test.ts: the two copies of
// the rules must agree, or the form ticks off a password the server refuses.
describe('the password rules, as the form applies them', () => {
  it('match the server case for case', () => {
    expect(passwordProblems('Tangerine-Lantern-42!')).toEqual([]);
    expect(passwordProblems('Short1!a')).toContain('length');
    expect(passwordProblems('alllowercase-words-42')).toContain('upper');
    expect(passwordProblems('NO-LOWER-CASE-HERE-42')).toContain('lower');
    expect(passwordProblems('No-Numbers-In-This-One')).toContain('number');
    expect(passwordProblems('NoSymbolsInThisOne42')).toContain('symbol');
    expect(passwordProblems('P@ssw0rd2024!Abc')).toContain('common');
    expect(passwordProblems('Welcome12345!', {})).toContain('common');
    expect(passwordProblems('Rahim-Reads-Books-7!', { username: 'rahim_reads' })).toContain('personal');
    expect(passwordProblems('Shelf-Owner-77!x', { email: 'owner.shelf@test.com' })).toContain('personal');
    expect(passwordProblems('Lantern-aaaa-River-9!')).toContain('pattern');
    expect(passwordProblems('Lantern-1234-River-!x')).toContain('pattern');
  });

  it('call a password ready only when every rule is met', () => {
    expect(passwordReady('')).toBe(false);
    expect(passwordReady('Tangerine-Lantern-42!')).toBe(true);
    expect(passwordReady('Tangerine-Lantern-42!', { username: 'tangerine' })).toBe(false);
  });
});
