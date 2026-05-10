'use client';
import { useState, useRef, useEffect } from 'react';
import { useCurrency } from '../../context/currencyContext';

export default function CurrencySelector() {
  const { currency, setCurrency, meta, allCurrencies } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = meta[currency];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Select currency"
        aria-expanded={open}
      >
        <span>{current.flag}</span>
        <span>{currency}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            Select currency
          </div>
          {allCurrencies.map((code) => {
            const m = meta[code];
            return (
              <button
                key={code}
                onClick={() => { setCurrency(code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                  code === currency ? 'text-brand-orange font-semibold bg-orange-50' : 'text-gray-700'
                }`}
              >
                <span className="text-base w-5">{m.flag}</span>
                <span className="flex-1 text-left">{m.name}</span>
                <span className="text-gray-400 font-medium text-xs">{m.symbol}</span>
                {code === currency && (
                  <svg className="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100 mt-1">
            Prices shown are approximate. Payments processed in USD.
          </div>
        </div>
      )}
    </div>
  );
}
