import { useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  LogOut,
  RotateCcw,
  Smartphone,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { DEFAULT_TEAM_MEMBERS } from '../data/mockVehicles';
import type { FirebaseConfig, TeamUser, Vehicle } from '../types/vehicle';
import { exportVehiclesToCsv, parseCsvVehicles } from '../services/csvService';
import {
  clearRuntimeFirebaseConfig,
  getEnvFirebaseConfig,
  getSavedFirebaseConfig,
  saveRuntimeFirebaseConfig,
} from '../services/firebase';
import { bulkImportVehicles, resetLocalDemoData } from '../services/vehicleService';
import { triggerHaptic } from '../services/nativeBridge';

interface SettingsModalProps {
  user: TeamUser;
  vehicles: Vehicle[];
  onClose: () => void;
  onSelectLocalUser: (name: string, email: string) => void;
  onSignOutFirebase: () => Promise<void>;
  onFirebaseConfigChanged: () => Promise<void>;
}

export function SettingsModal({
  user,
  vehicles,
  onClose,
  onSelectLocalUser,
  onSignOutFirebase,
  onFirebaseConfigChanged,
}: SettingsModalProps) {
  const envConfigured = Boolean(getEnvFirebaseConfig());
  const savedConfig = getSavedFirebaseConfig();

  const [configText, setConfigText] = useState(
    savedConfig ? JSON.stringify(savedConfig, null, 2) : ''
  );
  const [configFeedback, setConfigFeedback] = useState('');
  const [importFeedback, setImportFeedback] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveCloudConfig = async () => {
    setConfigFeedback('');
    try {
      // Allow pasting either strict JSON or raw Firebase JS object snippet
      const cleaned = configText
        .trim()
        .replace(/const\s+\w+\s*=\s*/, '')
        .replace(/;\s*$/, '')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"');
      const parsed = JSON.parse(cleaned) as Partial<FirebaseConfig>;
      if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
        setConfigFeedback('Missing required fields: apiKey, authDomain, projectId, appId.');
        return;
      }
      saveRuntimeFirebaseConfig(parsed as FirebaseConfig);
      triggerHaptic('success');
      await onFirebaseConfigChanged();
      onClose();
    } catch {
      setConfigFeedback('Could not parse Firebase config. Paste the firebaseConfig object from Firebase Console.');
    }
  };

  const handleDisconnectCloud = async () => {
    clearRuntimeFirebaseConfig();
    triggerHaptic('medium');
    await onFirebaseConfigChanged();
    setConfigText('');
    setConfigFeedback('Switched back to Local Team Mode.');
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
      setImportFeedback(`Imported ${count} vehicle${count === 1 ? '' : 's'} into inventory.`);
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
            <p className="text-xs text-slate-400">Team identity, real-time cloud sync &amp; backups</p>
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
          {/* Active Identity */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Active Team Member</h3>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  user.mode === 'firebase'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-sky-500/15 text-sky-300'
                }`}
              >
                {user.mode === 'firebase' ? 'Firebase Live' : 'Local Mode'}
              </span>
            </div>

            {user.mode === 'firebase' ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                  <div className="text-xs text-slate-400 truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await onSignOutFirebase();
                    onClose();
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/12 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-2.5">
                  Choose who is logging updates on this device (connect Firebase below for multi-phone live sync):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_TEAM_MEMBERS.map((member) => {
                    const active = member.email === user.email;
                    return (
                      <button
                        key={member.email}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectLocalUser(member.name, member.email);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-300'
                            : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {member.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Firebase Real-Time Sync */}
          <section className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center gap-2">
              {savedConfig ? (
                <Cloud className="w-4 h-4 text-emerald-400" />
              ) : (
                <CloudOff className="w-4 h-4 text-slate-400" />
              )}
              <h3 className="text-sm font-semibold text-white">Real-Time Cloud Sync (Firebase)</h3>
            </div>

            {envConfigured ? (
              <p className="text-xs text-emerald-300/90 leading-relaxed">
                Connected automatically via build configuration ({savedConfig?.projectId}). Changes sync live across all authorized team phones with offline lot caching enabled.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Paste your <code className="font-mono-code text-slate-300">firebaseConfig</code> from Firebase Console to enable live multi-device Firestore sync &amp; team login without rebuilding.
                </p>
                <textarea
                  rows={4}
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'
                  className="field-input font-mono-code text-xs resize-none"
                />
                {configFeedback && (
                  <p className="text-xs text-amber-300">{configFeedback}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveCloudConfig}
                    className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Connect Firebase Sync
                  </button>
                  {savedConfig && (
                    <button
                      type="button"
                      onClick={handleDisconnectCloud}
                      className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 font-semibold text-xs cursor-pointer"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </>
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

            {user.mode === 'local' && (
              <button
                type="button"
                onClick={() => {
                  resetLocalDemoData();
                  triggerHaptic('medium');
                  setImportFeedback('Restored sample lot inventory.');
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Sample Inventory Data
              </button>
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
