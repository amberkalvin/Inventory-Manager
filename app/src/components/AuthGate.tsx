import { useEffect, useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { triggerHaptic } from '../services/nativeBridge';

const SHOP_PIN = '4115';
const SHOP_PIN_STORAGE_KEY = 'im_shop_pin_v2';

export function isShopPinUnlocked(): boolean {
  try {
    return localStorage.getItem(SHOP_PIN_STORAGE_KEY) === SHOP_PIN;
  } catch {
    return false;
  }
}

export function lockShopPin(): void {
  try {
    localStorage.removeItem(SHOP_PIN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface AuthGateProps {
  onUnlocked: () => void;
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
] as const;

export function AuthGate({ onUnlocked }: AuthGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    setError('');
    triggerHaptic('light');
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        if (next === SHOP_PIN) {
          try {
            localStorage.setItem(SHOP_PIN_STORAGE_KEY, SHOP_PIN);
          } catch {
            // Ignore storage errors
          }
          triggerHaptic('success');
          window.setTimeout(() => onUnlocked(), 80);
          return next;
        }
        triggerHaptic('medium');
        setError('Incorrect shop PIN. Try again.');
        window.setTimeout(() => setPin(''), 260);
        return next;
      }
      return next;
    });
  };

  const handleBackspace = () => {
    triggerHaptic('light');
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    triggerHaptic('light');
    setError('');
    setPin('');
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#0B0E14]">
      <div className="w-full max-w-xs surface-card rounded-3xl p-6 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center space-y-2.5">
          <img
            src="./apple-touch-icon.png"
            alt="Inventory Manager"
            className="w-14 h-14 rounded-2xl border border-white/10 shadow-lg"
          />
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Inventory Manager
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Enter 4-digit shop PIN
            </p>
          </div>
        </div>

        {/* 4-Dot PIN Indicator */}
        <div
          aria-label={`Entered ${pin.length} of 4 digits`}
          className="flex items-center justify-center gap-4 py-1"
        >
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  error
                    ? 'bg-red-400 border-red-400 scale-105'
                    : filled
                      ? 'bg-sky-400 border-sky-400 scale-110'
                      : 'bg-transparent border-slate-600'
                }`}
              />
            );
          })}
        </div>

        <div className="min-h-[20px] text-center">
          {error && <p className="text-xs font-medium text-red-400">{error}</p>}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {KEYPAD_ROWS.flat().map((key) => {
            if (key === 'clear') {
              return (
                <button
                  key="clear"
                  type="button"
                  onClick={handleClear}
                  className="h-14 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-95 border border-white/[0.06] text-xs font-semibold uppercase tracking-wider text-slate-400 transition-all cursor-pointer"
                >
                  Clear
                </button>
              );
            }
            if (key === 'back') {
              return (
                <button
                  key="back"
                  type="button"
                  onClick={handleBackspace}
                  aria-label="Delete digit"
                  className="h-14 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] active:scale-95 border border-white/[0.06] flex items-center justify-center text-slate-300 transition-all cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={key}
                id={`pin-key-${key}`}
                type="button"
                onClick={() => handleDigit(key)}
                className="h-14 rounded-2xl bg-[#161D2A] hover:bg-[#1E283A] active:scale-95 border border-white/[0.08] text-xl font-bold font-mono-code text-white transition-all cursor-pointer"
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
