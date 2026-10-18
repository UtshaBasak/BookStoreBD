/** The re-check before an account change: see components/IdentityCheck.tsx. */

/** What the person gave to confirm it is them: their password, or an e-mailed code. */
export interface Identity {
  password: string;
  code: string;
}

export const NO_IDENTITY: Identity = { password: '', code: '' };

/** Whether enough has been given to try. */
export const identityGiven = (identity: Identity, passwordSet: boolean): boolean =>
  passwordSet ? identity.password.length > 0 : /^\d{6}$/.test(identity.code.trim());

/** The request body fields for what was given. */
export const identityBody = (identity: Identity, passwordSet: boolean): { password?: string; code?: string } =>
  passwordSet ? { password: identity.password } : { code: identity.code.trim() };
