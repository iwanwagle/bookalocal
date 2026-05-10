'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const I18nContext = createContext(null);

// Lazy-load translation files
const loadTranslations = async (locale) => {
  try {
    const res = await fetch(`/locales/${locale}/common.json`);
    if (!res.ok) throw new Error('Not found');
    return await res.json();
  } catch {
    // Fall back to English
    if (locale !== 'en') {
      const fallback = await fetch('/locales/en/common.json');
      return fallback.ok ? fallback.json() : {};
    }
    return {};
  }
};

// Resolve nested key like "nav.explore"
const resolve = (obj, key) => {
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return key;
    current = current[part];
  }
  return current ?? key;
};

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState('en');
  const [strings, setStrings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('bl_locale') || 'en') : 'en';
    setLocaleState(saved);
    loadTranslations(saved).then((data) => { setStrings(data); setLoading(false); });
  }, []);

  const setLocale = useCallback(async (code) => {
    setLocaleState(code);
    if (typeof window !== 'undefined') localStorage.setItem('bl_locale', code);
    setLoading(true);
    const data = await loadTranslations(code);
    setStrings(data);
    setLoading(false);
    // Update html lang attribute
    document.documentElement.lang = code;
  }, []);

  const t = useCallback((key, fallback) => {
    const result = resolve(strings, key);
    return result === key ? (fallback || key) : result;
  }, [strings]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, loading, locales: ['en', 'ne'] }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};

// Language metadata
export const LOCALE_META = {
  en: { label: 'English', flag: '🇬🇧', nativeName: 'English' },
  ne: { label: 'Nepali', flag: '🇳🇵', nativeName: 'नेपाली' },
};
