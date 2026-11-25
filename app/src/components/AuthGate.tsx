import { useState } from 'react';
import { Loader2, Lock, Mail, User } from 'lucide-react';
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
} from '../services/firebase';
import { isEmbeddedNativeShell, triggerHaptic } from '../services/nativeBridge';

interface AuthGateProps {
  onUseLocalDemo: () => void;
}

export function AuthGate({ onUseLocalDemo }: AuthGateProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nativeShell = isEmbeddedNativeShell();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    triggerHaptic('light');
    try {
      if (isRegister) {
        await registerWithEmail(name, email, password);
      } else {
        await loginWithEmail(email, password);
      }
      triggerHaptic('success');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace('Firebase: ', '')
          : 'Unable to sign in. Check your email and password.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle();
      triggerHaptic('success');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace('Firebase: ', '')
          : 'Google Sign-In failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#0B0E14]">
      <div className="w-full max-w-sm surface-card rounded-2xl p-6 space-y-5 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <img
            src="./apple-touch-icon.png"
            alt="Inventory Manager"
            className="w-12 h-12 rounded-xl border border-white/10"
          />
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Inventory Manager
            </h1>
            <p className="text-xs text-slate-400">
              Sign in with your team account
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Your Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  className="field-input pl-10"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Team Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@team.com"
                className="field-input pl-10"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                minLength={6}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field-input pl-10"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRegister ? 'Create Team Account' : 'Sign In'}
          </button>
        </form>

        {!nativeShell && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.08]" />
              <span className="text-[11px] text-slate-500 uppercase tracking-wider">or</span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogle}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/[0.1] text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              Continue with Google
            </button>
          </>
        )}

        <div className="pt-1 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setIsRegister((v) => !v);
              setError('');
            }}
            className="text-sky-400 hover:underline cursor-pointer"
          >
            {isRegister ? 'Already have a login?' : 'Create team login'}
          </button>

          <button
            type="button"
            onClick={onUseLocalDemo}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Offline Demo Mode
          </button>
        </div>
      </div>
    </main>
  );
}
