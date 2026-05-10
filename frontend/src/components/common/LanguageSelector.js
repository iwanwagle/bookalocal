'use client';
import { useState, useRef, useEffect } from 'react';
import { useI18n, LOCALE_META } from '../../context/i18nContext';

export default function LanguageSelector() {
  const { locale, setLocale, locales } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = LOCALE_META[locale];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Select language"
      >
        <span>{current?.flag}</span>
        <span className="hidden sm:inline">{current?.nativeName}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {locales.map((code) => {
            const m = LOCALE_META[code];
            return (
              <button
                key={code}
                onClick={() => { setLocale(code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${code === locale ? 'text-brand-orange font-semibold bg-orange-50' : 'text-gray-700'}`}
              >
                <span>{m.flag}</span>
                <span className="flex-1 text-left">{m.nativeName}</span>
                {code === locale && (
                  <svg className="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
