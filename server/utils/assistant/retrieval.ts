import { phoneticKey } from '../phonetic.js';
import { toAsciiDigits } from '../contactDetails.js';
import type { Language } from '../language.js';
import { knowledgeBase, type KnowledgeChunk } from './knowledge.js';

/**
 * Finding the help text that answers a question.
 *
 * The knowledge base is a few dozen short topics, so this is keyword matching
 * in memory rather than a vector index: nothing to build, nothing to pay for,
 * the same in tests as in production, and it reads Banglish through the same
 * sound-alike keys the catalogue search uses ("delivery koto" finds the
 * delivery charges as readily as "ডেলিভারি চার্জ").
 */

const normalise = (text: string): string =>
  toAsciiDigits(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'how', 'what', 'can', 'i', 'my', 'me', 'you', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'it', 'be', 'if', 'with', 'about', 'your', 'when', 'will', 'there', 'this', 'that', 'much', 'many',
  'ki', 'kivabe', 'koto', 'ami', 'amar', 'apnar', 'ache', 'hobe', 'kore', 'korbo', 'jodi', 'na', 'er',
  'কি', 'কী', 'কীভাবে', 'কিভাবে', 'আমি', 'আমার', 'আপনার', 'কত', 'হবে', 'করে', 'করব', 'যদি', 'না', 'এর', 'আছে',
]);

const wordsOf = (text: string): string[] => normalise(text).split(' ').filter((word) => word.length > 1 && !STOP.has(word));

interface Indexed {
  chunk: KnowledgeChunk;
  phrases: string[];
  words: Set<string>;
  sounds: Set<string>;
}

let index: Indexed[] | null = null;

const buildIndex = (): Indexed[] =>
  knowledgeBase().map((chunk) => {
    const words = new Set([
      ...wordsOf(chunk.title.en),
      ...wordsOf(chunk.title.bn),
      ...chunk.keywords.flatMap(wordsOf),
    ]);
    return {
      chunk,
      phrases: chunk.keywords.map(normalise).filter((phrase) => phrase.includes(' ')),
      words,
      sounds: new Set([...words].map((word) => phoneticKey(word)).filter((key) => key.length >= 3)),
    };
  });

/** For tests, after the config behind the knowledge base changes. */
export const forgetKnowledgeIndex = (): void => {
  index = null;
};

export interface HelpMatch {
  chunk: KnowledgeChunk;
  score: number;
}

/** The topics that best answer a question, best first, with how well each matched. */
export const searchKnowledge = (question: string, limit = 3): HelpMatch[] => {
  index ??= buildIndex();
  const text = normalise(question);
  const words = wordsOf(question);
  const sounds = words.map((word) => phoneticKey(word)).filter((key) => key.length >= 3);
  return index
    .map(({ chunk, phrases, words: known, sounds: knownSounds }) => {
      let score = 0;
      for (const phrase of phrases) if (text.includes(phrase)) score += 3;
      for (const word of words) if (known.has(word)) score += 2;
      for (const sound of sounds) if (knownSounds.has(sound)) score += 1;
      return { chunk, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

/** A topic as the model reads it: labelled data, in one language, with its page. */
export const helpAsData = (chunk: KnowledgeChunk, language: Language): { topic: string; title: string; text: string; page: string } => ({
  topic: chunk.topic,
  title: chunk.title[language],
  text: chunk.text[language],
  page: chunk.link,
});

/** Whether a question is plainly about the shop, judged without the model. */
export const looksLikeShopQuestion = (question: string): boolean => (searchKnowledge(question, 1)[0]?.score ?? 0) >= 3;
