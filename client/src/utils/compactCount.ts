import { currentLanguage, digits } from './language.js';

/** 950, 1.2k, 12k, 1.2M: short enough for a card. In Bangla, ৯৫০, ১.২ হাজার, ১.২ লাখ. */
export const compactCount = (value: number | undefined): string => {
  const n = Math.max(0, Math.round(value ?? 0));
  if (currentLanguage() === 'bn') {
    if (n < 1000) return digits(n);
    if (n < 100_000) return `${digits((n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, ''))} হাজার`;
    return `${digits((n / 100_000).toFixed(1).replace(/\.0$/, ''))} লাখ`;
  }
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

/** "1 view", "1.2k views"; in Bangla "১.২ হাজার বার দেখা", from the Bangla given (which has no plural). */
export const countLabel = (value: number | undefined, one: string, many: string, bangla?: string): string =>
  currentLanguage() === 'bn' && bangla !== undefined
    ? `${compactCount(value)} ${bangla}`
    : `${compactCount(value)} ${(value ?? 0) === 1 ? one : many}`;
