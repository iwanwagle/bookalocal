'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Approximate rates relative to NPR (updated manually or via API)
const BASE_RATES_FROM_NPR = {
  NPR: 1,
  USD: 0.0075,
  EUR: 0.0069,
  GBP: 0.0059,
  AUD: 0.0115,
  INR: 0.625,
  CNY: 0.054,
  JPY: 1.12,
};

const CURRENCY_META = {
  NPR: { symbol: 'NPR', name: 'Nepali Rupee', flag: '🇳🇵' },
  USD: { symbol: '$',   name: 'US Dollar',    flag: '🇺🇸' },
  EUR: { symbol: '€',   name: 'Euro',         flag: '🇪🇺' },
  GBP: { symbol: '£',   name: 'British Pound', flag: '🇬🇧' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar', flag: '🇦🇺' },
  INR: { symbol: '₹',   name: 'Indian Rupee',  flag: '🇮🇳' },
  CNY: { symbol: '¥',   name: 'Chinese Yuan',  flag: '🇨🇳' },
  JPY: { symbol: '¥',   name: 'Japanese Yen',  flag: '🇯🇵' },
};

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState('NPR');
  const [rates, setRates] = useState(BASE_RATES_FROM_NPR);
  const [ratesLoading, setRatesLoading] = useState(false);

  // Persist selection across sessions
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('bl_currency') : null;
    if (saved && CURRENCY_META[saved]) setCurrencyState(saved);
  }, []);

  const setCurrency = useCallback((code) => {
    if (!CURRENCY_META[code]) return;
    setCurrencyState(code);
    if (typeof window !== 'undefined') localStorage.setItem('bl_currency', code);
  }, []);

  // Fetch live rates with 1-hour localStorage cache.
  // Avoids hitting the third-party API on every page load.
  useEffect(() => {
    const CACHE_KEY = 'bl_fx_cache';
    const CACHE_TTL_MS = 60 * 60 * 1000;

    const fromCache = () => {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
        if (!raw) return null;
        const { rates: cachedRates, fetchedAt } = JSON.parse(raw);
        if (!cachedRates || !fetchedAt) return null;
        if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;
        return cachedRates;
      } catch { return null; }
    };

    const cached = fromCache();
    if (cached) {
      setRates({ ...BASE_RATES_FROM_NPR, ...cached });
      return; // skip the network call entirely while cache is fresh
    }

    const fetchRates = async () => {
      setRatesLoading(true);
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/NPR');
        if (res.ok) {
          const data = await res.json();
          const supported = {};
          Object.keys(CURRENCY_META).forEach((code) => {
            if (data.rates[code]) supported[code] = data.rates[code];
          });
          if (Object.keys(supported).length > 1) {
            setRates({ ...BASE_RATES_FROM_NPR, ...supported });
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ rates: supported, fetchedAt: Date.now() }));
            } catch {}
          }
        }
      } catch {
        // Use static fallback rates silently
      } finally {
        setRatesLoading(false);
      }
    };
    fetchRates();
  }, []);

  /**
   * Convert a price in NPR to the selected currency.
   * @param {number} amountNPR - price in Nepali Rupees
   * @returns {string} formatted string e.g. "$12.50" or "NPR 1,675"
   */
  const formatPrice = useCallback((amountNPR) => {
    if (!amountNPR && amountNPR !== 0) return '—';
    const rate = rates[currency] ?? BASE_RATES_FROM_NPR[currency] ?? 1;
    const converted = amountNPR * rate;
    const meta = CURRENCY_META[currency];

    // Format based on magnitude
    if (currency === 'NPR' || currency === 'INR' || currency === 'JPY') {
      return `${meta.symbol} ${Math.round(converted).toLocaleString()}`;
    }
    return `${meta.symbol}${converted < 10 ? converted.toFixed(2) : Math.round(converted).toLocaleString()}`;
  }, [currency, rates]);

  /**
   * Get raw converted number
   */
  const convertPrice = useCallback((amountNPR) => {
    const rate = rates[currency] ?? BASE_RATES_FROM_NPR[currency] ?? 1;
    return amountNPR * rate;
  }, [currency, rates]);

  return (
    <CurrencyContext.Provider value={{
      currency,
      setCurrency,
      formatPrice,
      convertPrice,
      meta: CURRENCY_META,
      allCurrencies: Object.keys(CURRENCY_META),
      ratesLoading,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};
