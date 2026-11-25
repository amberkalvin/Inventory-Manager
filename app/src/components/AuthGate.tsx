import { useEffect, useState } from 'react';
import { ArrowRight, Delete, Lock, User } from 'lucide-react';
import {
  getSavedUserName,
  isShopPinUnlocked,
  saveUserName,
  verifyAndStoreShopPin,
} from '../services/shopAuth';
import { triggerHaptic } from '../services/nativeBridge';

interface AuthGateProps {
  onAuthenticated: (userName: string) => void;
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
] as const;

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [step, setStep] = useState<'pin' | 'name'>(() =>
    isShopPinUnlocked() ? 'name' : 'pin'
  );
  const [pin, setPin] = useState('');
  const [name, setName] = useState(() => getSavedUserName());
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    if (step !== 'pin') return;
    setError('');
    triggerHaptic('light');
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        if (verifyAndStoreShopPin(next)) {
          triggerHaptic('success');
          const existingName = getSavedUserName();
          if (existingName) {
            window.setTimeout(() => onAuthenticated(existingName), 80);
          } else {
            window.setTimeout(() => {
              setPin('');
              setError('');
              setStep('name');
            }, 80);
          }
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
    if (step !== 'pin') return;
    triggerHaptic('light');
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (step !== 'pin') return;
    triggerHaptic('light');
    setError('');
    setPin('');
  };

  useEffect(() => {
    if (step !== 'pin') return;
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

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setError('Please enter your name so vehicle changes can be tracked.');
      return;
    }
    triggerHaptic('success');
    saveUserName(cleaned);
    onAuthenticated(cleaned);
  };

  if (step === 'name') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#0B0E14]">
        <div className="w-full max-w-xs surface-card rounded-3xl p-6 space-y-5 shadow-2xl">
          <div className="flex flex-col items-center text-center space-y-2.5">
            <img
              src="./apple-touch-icon.png"
              alt="Inventory Manager"
              className="w-14 h-14 rounded-2xl border border-white/10 shadow-lg"
            />
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Welcome!
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Enter your name so edits and history log who made each change.
              </p>
            </div>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="login-user-name"
                className="block text-xs font-medium text-slate-400 mb-1.5"
              >
                Your Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-user-name"
                  type="text"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => {
                    setError('');
                    setName(e.target.value);
                  }}
                  placeholder="e.g. Alex"
                  className="field-input pl-10"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs font-medium text-red-400">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Continue to Inventory</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>
    );
  }

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
