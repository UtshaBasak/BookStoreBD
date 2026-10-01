import { allowed } from './consent.js';

/**
 * Speech to text for the search box, through the browser's own speech
 * recognition (Chrome, Edge, Safari and Samsung Internet; not Firefox).
 * Nothing is recorded here: the browser hears, and hands back the words.
 */

/** The little of the Web Speech API used here, which TypeScript's DOM library does not describe. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

const constructor = (): RecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const voiceSearchSupported = (): boolean => constructor() !== null;

export type VoiceLanguage = 'en-US' | 'bn-BD';
const LANG_KEY = 'voiceLanguage';

export const readVoiceLanguage = (): VoiceLanguage => {
  try {
    return localStorage.getItem(LANG_KEY) === 'bn-BD' ? 'bn-BD' : 'en-US';
  } catch {
    return 'en-US';
  }
};

export const rememberVoiceLanguage = (language: VoiceLanguage): void => {
  if (!allowed('preferences')) return;
  try {
    localStorage.setItem(LANG_KEY, language);
  } catch {
    /* remembered for this visit only */
  }
};

export interface Listening {
  stop: () => void;
}

/**
 * Listens once. `onWords` gets the words so far as they are heard, then the
 * final words with `done`; `onFail` says what went wrong in a sentence.
 */
export const listen = (
  language: VoiceLanguage,
  onWords: (words: string, done: boolean) => void,
  onFail: (message: string) => void,
  onStop: () => void
): Listening | null => {
  const Speech = constructor();
  if (!Speech) return null;
  const recognition = new Speech();
  recognition.lang = language;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let words = '';
    let done = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      words += event.results[i][0].transcript;
      done = done || event.results[i].isFinal;
    }
    onWords(words.trim(), done);
  };
  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'not-allowed': 'Allow the microphone for this site to search by voice.',
      'service-not-allowed': 'Allow the microphone for this site to search by voice.',
      'no-speech': 'We did not catch that. Tap the microphone and try again.',
      'audio-capture': 'No microphone was found.',
      network: 'Voice search needs an internet connection.',
    };
    if (event.error !== 'aborted') onFail(messages[event.error] ?? 'Voice search stopped. Please try again.');
  };
  recognition.onend = onStop;
  recognition.start();
  return { stop: () => recognition.stop() };
};
