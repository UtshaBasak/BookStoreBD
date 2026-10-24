import { useSyncExternalStore } from 'react';

import { currentLanguage, readLanguageChoice, setLanguage, type Language, type LanguageChoice } from './language.js';

const subscribe = (onChange: () => void) => {
  window.addEventListener('bookstorebd:language', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('bookstorebd:language', onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** The choice, and the language it comes to, kept current. */
export const useLanguage = (): { choice: LanguageChoice; language: Language; setLanguage: (choice: LanguageChoice) => void } => {
  const choice = useSyncExternalStore(subscribe, readLanguageChoice, () => 'system' as LanguageChoice);
  const language = useSyncExternalStore(subscribe, currentLanguage, () => 'en' as Language);
  return { choice, language, setLanguage };
};
