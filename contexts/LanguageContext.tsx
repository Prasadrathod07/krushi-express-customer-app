import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { I18n, Language, Translations } from '../lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: Translations;
  getLanguageName: (lang: Language) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [translations, setTranslations] = useState<Translations>(I18n.t());

  useEffect(() => {
    const initLanguage = async () => {
      await I18n.init();
      const currentLang = I18n.getLanguage();
      setLanguageState(currentLang);
      setTranslations(I18n.t());
    };
    initLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    await I18n.setLanguage(lang);
    setLanguageState(lang);
    setTranslations(I18n.t());
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: translations,
        getLanguageName: I18n.getLanguageName,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
