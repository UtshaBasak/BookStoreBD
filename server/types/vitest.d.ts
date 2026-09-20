/**
 * Everything globalSetup hands to the test files through `inject`.
 *
 * Declaring it here is what makes `inject('mongoUri')` a typed string rather
 * than `unknown`, and a typo in the key a compile error.
 */
declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

export {};
