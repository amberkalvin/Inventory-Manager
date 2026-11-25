import { useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Download,
  Lock,
  RefreshCw,
  Smartphone,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import type { SyncState, TeamUser, Vehicle } from '../types/vehicle';
import { exportVehiclesToCsv, parseCsvVehicles } from '../services/csvService';
import { bulkImportVehicles, fetchVehiclesFromRemote } from '../services/vehicleService';
import { formatRelativeTime } from '../utils/format';
import { triggerHaptic } from '../services/nativeBridge';

interface SettingsModalProps {
  user: TeamUser;
  vehicles: Vehicle[];
  syncState: SyncState;
  onClose: () => void;
  onUpdateUserName: (name: string) => void;
  onLockApp: () => void;
}

export function SettingsModal({
  user,
  vehicles,
  syncState,
  onClose,
  onUpdateUserName,
  onLockApp,
}: SettingsModalProps) {
  const [nameInput, setNameInput] = useState(user.name);
  const [nameSaved, setNameSaved] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');
  const [syncingNow, setSyncingNow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim();
    if (!cleaned) return;
    triggerHaptic('success');
    onUpdateUserName(cleaned);
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 1800);
  };

  const handleManualSync = async () => {
    triggerHaptic('light');
    setSyncingNow(true);
    try {
      await fetchVehiclesFromRemote();
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFeedback('');
    try {
      const text = await file.text();
      const parsed = parseCsvVehicles(text);
      if (parsed.length === 0) {
        setImportFeedback('No valid vehicle rows found in that CSV.');
        return;
      }
      const count = await bulkImportVehicles(user, parsed);
      triggerHaptic('success');
      setImportFeedback(`Imported ${count} vehicle${count === 1 ? '' : 's'} and synced to Google Sheets.`);
    } catch (err) {
      setImportFeedback(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet w-full sm:max-w-lg max-h-[90vh] flex flex-col bg-[#121721] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Settings &amp; Sync</h2>
            <p className="text-xs text-slate-400">Your name, Google Sheets sync &amp; backups</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Your Name (for Change History Tracking) */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Your Name</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onLockApp();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/12 text-[11px] font-semibold text-slate-300 cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                Lock PIN
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Used to record who made each vehicle update and checklist change in the activity history.
            </p>

            <form onSubmit={handleSaveName} className="flex gap-2">
              <input
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter your name"
                className="field-input text-sm"
              />
              <button
                type="submit"
                disabled={!nameInput.trim() || nameInput.trim() === user.name}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-white/[0.06] disabled:text-slate-500 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                {nameSaved ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{nameSaved ? 'Saved' : 'Save'}</span>
              </button>
            </form>
          </section>

          {/* Google Sheets Live Sync Status */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {syncState.status === 'offline' || syncState.status === 'error' ? (
                  <CloudOff className="w-4 h-4 text-amber-400" />
                ) : (
                  <Cloud className="w-4 h-4 text-emerald-400" />
                )}
                <h3 className="text-sm font-semibold text-white">Google Sheets Sync</h3>
              </div>
              <button
                type="button"
                disabled={syncingNow || syncState.status === 'syncing'}
                onClick={handleManualSync}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/12 text-xs font-semibold text-sky-300 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    syncingNow || syncState.status === 'syncing' ? 'animate-spin' : ''
                  }`}
                />
                Sync Now
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Automatically pulls the latest lot inventory every 10 seconds and pushes every add, edit, move, or delete directly to your connected Google Sheet.
            </p>

            <div className="text-xs text-slate-300 flex items-center justify-between pt-1 border-t border-white/[0.06]">
              <span>Status</span>
              <span className="font-mono-code text-[11px] text-slate-300">
                {syncState.status === 'synced' && syncState.lastSyncedAt
                  ? `Synced ${formatRelativeTime(syncState.lastSyncedAt)}`
                  : syncState.status === 'syncing'
                    ? 'Syncing…'
                    : syncState.status === 'offline'
                      ? 'Offline (using cache)'
                      : syncState.status === 'error'
                        ? 'Sync Error'
                        : 'Connecting…'}
              </span>
            </div>

            {syncState.error && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
                {syncState.error}
              </p>
            )}
          </section>

          {/* Backup / CSV Utilities */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Data Backup &amp; Utilities</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  exportVehiclesToCsv(vehicles);
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/[0.08] text-xs font-semibold text-slate-100 cursor-pointer"
              >
                <Download className="w-4 h-4 text-sky-400" />
                Export CSV ({vehicles.length})
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/[0.08] text-xs font-semibold text-slate-100 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                Import CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvFile}
              />
            </div>
            {importFeedback && (
              <p className="text-xs text-emerald-400 font-medium">{importFeedback}</p>
            )}
          </section>

          {/* Install Tip */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 flex items-start gap-3">
            <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-200">Install on Phone:</strong> In iPhone Safari tap{' '}
              <strong className="text-slate-200">Share → Add to Home Screen</strong>. On Android Chrome tap{' '}
              <strong className="text-slate-200">Menu → Install App</strong>, or download the native{' '}
              <code className="font-mono-code text-slate-300">.APK</code> /{' '}
              <code className="font-mono-code text-slate-300">.IPA</code> from the landing page.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
