import { currentLanguage } from './language.js';

/**
 * What a listing says about itself, for showing: a blank field, or one of the
 * "N/A" placeholders older listings were saved with, is nothing to show.
 */
export const given = (value: unknown): string => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return /^n\/?a$/i.test(text) ? '' : text;
};

/** The conditions a seller can choose, in Bangla. */
const CONDITIONS: Readonly<Record<string, string>> = {
  mint: 'একদম নতুনের মতো',
  'very good': 'খুব ভালো',
  good: 'ভালো',
  fair: 'মোটামুটি',
  poor: 'জীর্ণ',
};

/** A condition as it is shown: as saved in English, by its Bangla name in Bangla. */
export const conditionLabel = (condition: string): string =>
  currentLanguage() === 'bn' ? CONDITIONS[condition.trim().toLowerCase()] ?? condition : condition;

/** A copy's condition, which only a second-hand book has, for showing. */
export const conditionOf = (line: { bookType?: string | null; condition?: string | null }): string =>
  line.bookType === 'old' ? conditionLabel(given(line.condition)) : '';
