/** 950, 1.2k, 12k, 1.2M: short enough for a card. */
export const compactCount = (value: number | undefined): string => {
  const n = Math.max(0, Math.round(value ?? 0));
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
};

/** "1 view", "1.2k views". */
export const countLabel = (value: number | undefined, one: string, many: string): string =>
  `${compactCount(value)} ${(value ?? 0) === 1 ? one : many}`;
