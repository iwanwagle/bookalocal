'use client';
import { useState, useEffect, useCallback } from 'react';
import { listingsAPI } from '@/utils/api';
import toast from 'react-hot-toast';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isToday, isPast, isSameDay, addMonths, subMonths,
} from 'date-fns';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AvailabilityCalendar({ listingId, readOnly = false }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availability, setAvailability] = useState({}); // { 'YYYY-MM-DD': true/false }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listingsAPI.getAvailability(
        listingId,
        currentMonth.getMonth() + 1,
        currentMonth.getFullYear()
      );
      const map = {};
      (Array.isArray(data) ? data : []).forEach((d) => {
        map[d.date?.split('T')[0]] = d.is_available;
      });
      setAvailability(map);
      setPendingChanges({});
    } catch {
      toast.error('Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [listingId, currentMonth]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  const toggleDate = (dateStr) => {
    if (readOnly) return;
    setPendingChanges((prev) => {
      const current = prev[dateStr] !== undefined ? prev[dateStr] : (availability[dateStr] !== false);
      return { ...prev, [dateStr]: !current };
    });
  };

  const saveChanges = async () => {
    if (!Object.keys(pendingChanges).length) return;
    setSaving(true);
    try {
      const dates = Object.entries(pendingChanges).map(([date, is_available]) => ({ date, is_available }));
      await listingsAPI.setAvailability(listingId, dates);
      setAvailability((prev) => ({ ...prev, ...pendingChanges }));
      setPendingChanges({});
      toast.success('Availability saved!');
    } catch {
      toast.error('Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => setPendingChanges({});

  const isAvailable = (dateStr) => {
    if (pendingChanges[dateStr] !== undefined) return pendingChanges[dateStr];
    return availability[dateStr] !== false; // default: available
  };

  const hasPending = Object.keys(pendingChanges).length > 0;

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</h3>
        <button
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {[...Array(35)].map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {/* Leading empty cells */}
          {[...Array(firstDayOfWeek)].map((_, i) => <div key={`e-${i}`} />)}

          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const past = isPast(day) && !isToday(day);
            const today = isToday(day);
            const available = isAvailable(dateStr);
            const changed = pendingChanges[dateStr] !== undefined;

            let cls = 'aspect-square rounded-lg text-xs font-medium flex items-center justify-center transition-all select-none ';
            if (past) {
              cls += 'text-gray-300 cursor-default bg-gray-50';
            } else if (!isSameMonth(day, currentMonth)) {
              cls += 'text-gray-200';
            } else if (readOnly) {
              cls += available
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-400 line-through';
            } else {
              if (available) {
                cls += changed
                  ? 'bg-green-500 text-white ring-2 ring-green-300 cursor-pointer scale-105'
                  : 'bg-green-50 text-green-700 border border-green-200 cursor-pointer hover:bg-green-100';
              } else {
                cls += changed
                  ? 'bg-red-400 text-white ring-2 ring-red-300 cursor-pointer scale-105'
                  : 'bg-gray-100 text-gray-400 line-through cursor-pointer hover:bg-red-50';
              }
              if (today) cls += ' ring-2 ring-brand-orange ring-offset-1';
            }

            return (
              <button
                key={dateStr}
                className={cls}
                onClick={() => !past && toggleDate(dateStr)}
                disabled={past || readOnly}
                aria-label={`${dateStr}: ${available ? 'available' : 'unavailable'}`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend + actions */}
      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 inline-block" />
            Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-gray-100 inline-block" />
            Blocked
          </span>
          {!readOnly && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
              Changed
            </span>
          )}
        </div>

        {!readOnly && hasPending && (
          <div className="flex gap-2">
            <button
              onClick={discardChanges}
              className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Discard
            </button>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="text-xs px-4 py-1.5 bg-brand-orange text-white rounded-lg hover:bg-orange-600 disabled:opacity-60 font-semibold"
            >
              {saving ? 'Saving…' : `Save ${Object.keys(pendingChanges).length} change${Object.keys(pendingChanges).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <p className="text-xs text-gray-400 mt-3">
          Click dates to toggle availability. Green = you're available, gray = blocked. Changes are batched — save when ready.
        </p>
      )}
    </div>
  );
}
