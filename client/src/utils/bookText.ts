/**
 * What a listing says about itself, for showing: a blank field, or one of the
 * "N/A" placeholders older listings were saved with, is nothing to show.
 */
export const given = (value: unknown): string => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return /^n\/?a$/i.test(text) ? '' : text;
};

/** A copy's condition, which only a second-hand book has. */
export const conditionOf = (line: { bookType?: string | null; condition?: string | null }): string =>
  line.bookType === 'old' ? given(line.condition) : '';
