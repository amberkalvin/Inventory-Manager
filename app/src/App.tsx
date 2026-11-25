import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CarFront,
  Cloud,
  CloudOff,
  Plus,
  Search,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { DEFAULT_TEAM_MEMBERS } from './data/mockVehicles';
import {
  STATUS_META,
  STATUS_ORDER,
  type TeamUser,
  type Vehicle,
  type VehicleStatus,
} from './types/vehicle';
import {
  getSavedFirebaseConfig,
  logoutFirebase,
  resetFirebaseClients,
  subscribeFirebaseAuth,
} from './services/firebase';
import {
  createVehicle,
  deleteVehicle,
  subscribeVehicles,
  updateVehicle,
  type NewVehicleInput,
} from './services/vehicleService';
import { StatusSummaryBar, type StatusFilter } from './components/StatusSummaryBar';
import { VehicleCard } from './components/VehicleCard';
import { QuickAddModal } from './components/QuickAddModal';
import { VehicleDetailDrawer } from './components/VehicleDetailDrawer';
import { SettingsModal } from './components/SettingsModal';
import { AuthGate } from './components/AuthGate';
import { triggerHaptic } from './services/nativeBridge';

const LOCAL_USER_KEY = 'im_local_user_v1';

function loadLocalUser(): TeamUser {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; email?: string };
      if (parsed.name && parsed.email) {
        return { name: parsed.name, email: parsed.email, mode: 'local' };
      }
    }
  } catch {
    // Fallback to default member
  }
  return {
    name: DEFAULT_TEAM_MEMBERS[0].name,
    email: DEFAULT_TEAM_MEMBERS[0].email,
    mode: 'local',
  };
}

export function App() {
  const [hasFirebaseConfig, setHasFirebaseConfig] = useState<boolean>(() =>
    Boolean(getSavedFirebaseConfig())
  );
  const [forceLocalDemo, setForceLocalDemo] = useState(false);
  const [authReady, setAuthReady] = useState<boolean>(() => !getSavedFirebaseConfig());
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [localUser, setLocalUser] = useState<TeamUser>(loadLocalUser);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [syncError, setSyncError] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all_active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 2400);
  };

  // Track device connectivity for lot-walk awareness
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Subscribe to Firebase Auth whenever Firebase config is active
  useEffect(() => {
    if (!hasFirebaseConfig) {
      setFbUser(null);
      setAuthReady(true);
      return;
    }
    setAuthReady(false);
    const unsub = subscribeFirebaseAuth((user) => {
      setFbUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [hasFirebaseConfig]);

  const activeUser: TeamUser | null = useMemo(() => {
    if (hasFirebaseConfig && !forceLocalDemo) {
      if (!fbUser) return null;
      return {
        name:
          fbUser.displayName ||
          (fbUser.email ? fbUser.email.split('@')[0] : 'Team Member'),
        email: fbUser.email || 'team@local',
        mode: 'firebase',
      };
    }
    return localUser;
  }, [hasFirebaseConfig, forceLocalDemo, fbUser, localUser]);

  // Subscribe to real-time Firestore or Local Storage vehicles
  useEffect(() => {
    if (!activeUser) return;
    setSyncError('');
    const unsub = subscribeVehicles(
      activeUser.mode,
      (list) => {
        setVehicles(list);
        setSelectedVehicle((prev) =>
          prev ? list.find((v) => v.id === prev.id) ?? null : null
        );
      },
      (errMsg) => setSyncError(errMsg)
    );
    return () => unsub();
  }, [activeUser]);

  const statusCounts = useMemo(() => {
    const counts: Record<VehicleStatus, number> = {
      incoming: 0,
      minor_repair: 0,
      major_repair: 0,
      offsite: 0,
      ready: 0,
      sold: 0,
    };
    for (const v of vehicles) {
      if (counts[v.status] !== undefined) counts[v.status]++;
    }
    return counts;
  }, [vehicles]);

  const activeLotCount = useMemo(
    () => vehicles.filter((v) => v.status !== 'sold').length,
    [vehicles]
  );

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter === 'all_active' && v.status === 'sold') return false;
      if (statusFilter !== 'all_active' && statusFilter !== 'all' && v.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        v.stockNumber,
        v.vin ?? '',
        String(v.year),
        v.make,
        v.model,
        v.trim ?? '',
        v.color ?? '',
        v.location ?? '',
        v.assignedTo ?? '',
        v.repairNotes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [vehicles, statusFilter, searchQuery]);

  const suggestedStock = useMemo(() => {
    let maxNum = 1063;
    for (const v of vehicles) {
      const match = v.stockNumber.match(/(\d+)$/);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }
    return `STK-${maxNum + 1}`;
  }, [vehicles]);

  const handleSelectLocalUser = (name: string, email: string) => {
    const next: TeamUser = { name, email, mode: 'local' };
    setLocalUser(next);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify({ name, email }));
    showToast(`Switched to ${name}`);
  };

  const handleFirebaseConfigChanged = async () => {
    await resetFirebaseClients();
    setForceLocalDemo(false);
    setHasFirebaseConfig(Boolean(getSavedFirebaseConfig()));
  };

  const handleQuickStatus = async (vehicle: Vehicle, nextStatus: VehicleStatus) => {
    if (!activeUser) return;
    await updateVehicle(activeUser, vehicle, { status: nextStatus });
    showToast(`${vehicle.stockNumber} → ${STATUS_META[nextStatus].label}`);
  };

  const handleCreateVehicle = async (input: NewVehicleInput) => {
    if (!activeUser) return;
    await createVehicle(activeUser, input);
    showToast(`Added ${input.stockNumber}`);
  };

  const handleSaveVehicle = async (
    previous: Vehicle,
    updates: Partial<NewVehicleInput>
  ) => {
    if (!activeUser) return;
    await updateVehicle(activeUser, previous, updates);
    showToast(`Updated ${updates.stockNumber ?? previous.stockNumber}`);
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!activeUser) return;
    await deleteVehicle(activeUser, vehicleId);
    showToast('Removed vehicle from inventory');
  };

  // Loading auth state briefly when Firebase is configured
  if (hasFirebaseConfig && !forceLocalDemo && !authReady) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center text-slate-400 text-sm">
        Connecting to Inventory Manager…
      </div>
    );
  }

  // Require login when Firebase Cloud Sync is configured
  if (hasFirebaseConfig && !forceLocalDemo && !activeUser) {
    return <AuthGate onUseLocalDemo={() => setForceLocalDemo(true)} />;
  }

  const currentUser = activeUser ?? localUser;

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 pb-28 sm:pb-12">
      {/* Sticky App Header */}
      <header
        className="sticky top-0 z-30 bg-[#0B0E14]/90 backdrop-blur-md border-b border-white/[0.07]"
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="./apple-touch-icon.png"
              alt="Inventory Manager"
              className="w-9 h-9 rounded-xl border border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-[17px] font-extrabold text-white tracking-tight truncate">
                Inventory Manager
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {currentUser.mode === 'firebase' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <Cloud className="w-3 h-3" />
                    Live Sync
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sky-400 font-medium">
                    <CloudOff className="w-3 h-3" />
                    Local Mode
                  </span>
                )}
                <span>&bull;</span>
                <span className="truncate">{currentUser.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="desktop-add-vehicle-btn"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowQuickAdd(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Vehicle
            </button>
            <button
              id="open-settings-btn"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowSettings(true);
              }}
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/[0.08] flex items-center justify-center text-slate-200 cursor-pointer"
              aria-label="Open settings and sync options"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-4 space-y-4">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="rounded-xl bg-amber-500/12 border border-amber-400/25 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-amber-200">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Offline lot mode active — updates are cached locally and sync automatically when signal returns.</span>
          </div>
        )}

        {/* Sync Permission / Connection Error Banner */}
        {syncError && (
          <div className="rounded-xl bg-red-500/12 border border-red-400/25 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-red-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{syncError}</span>
          </div>
        )}

        {/* Tappable Status Counters */}
        <StatusSummaryBar
          counts={statusCounts}
          activeCount={activeLotCount}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />

        {/* Instant Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="inventory-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Stock #, last 6 of VIN, Make, Model, or Location…"
              className="field-input pl-10 pr-9 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Label */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
          <span>
            Showing <strong className="text-slate-200">{filteredVehicles.length}</strong>{' '}
            {filteredVehicles.length === 1 ? 'vehicle' : 'vehicles'}
            {statusFilter !== 'all_active' && statusFilter !== 'all'
              ? ` in ${STATUS_META[statusFilter].label}`
              : ' on active lot'}
          </span>
          {(statusFilter !== 'all_active' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all_active');
                setSearchQuery('');
              }}
              className="text-sky-400 font-medium hover:underline cursor-pointer"
            >
              Reset filter
            </button>
          )}
        </div>

        {/* Vehicle Cards Grid */}
        {filteredVehicles.length === 0 ? (
          <div className="surface-card rounded-2xl py-14 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] mx-auto flex items-center justify-center text-slate-400">
              <CarFront className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-white">No vehicles match this view</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Clear your search filter or tap Add Vehicle to log a new unit with instant VIN decoding.
            </p>
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Vehicle
            </button>
          </div>
        ) : (
          <section
            aria-label="Vehicle list"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {filteredVehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onSelect={setSelectedVehicle}
                onQuickStatusChange={handleQuickStatus}
              />
            ))}
          </section>
        )}
      </main>

      {/* Mobile Floating Action Button (+ Add Vehicle) */}
      <button
        id="mobile-add-vehicle-fab"
        type="button"
        onClick={() => {
          triggerHaptic('medium');
          setShowQuickAdd(true);
        }}
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        className="sm:hidden fixed right-4 z-40 inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-sky-500 active:scale-95 text-slate-950 font-extrabold text-sm shadow-2xl shadow-sky-950/60 transition-transform cursor-pointer"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        Add Vehicle
      </button>

      {/* Subtle Toast Confirmation */}
      {toast && (
        <div
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
          className="fixed left-1/2 -translate-x-1/2 sm:bottom-6 z-50 px-4 py-2.5 rounded-xl bg-[#1C2536] border border-white/15 text-xs font-semibold text-white shadow-2xl whitespace-nowrap"
        >
          {toast}
        </div>
      )}

      {/* Modals & Drawers */}
      {showQuickAdd && (
        <QuickAddModal
          suggestedStock={suggestedStock}
          defaultAssignee={currentUser.name}
          onClose={() => setShowQuickAdd(false)}
          onSubmit={handleCreateVehicle}
        />
      )}

      {selectedVehicle && (
        <VehicleDetailDrawer
          vehicle={selectedVehicle}
          mode={currentUser.mode}
          onClose={() => setSelectedVehicle(null)}
          onSave={handleSaveVehicle}
          onDelete={handleDeleteVehicle}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={currentUser}
          vehicles={vehicles}
          onClose={() => setShowSettings(false)}
          onSelectLocalUser={handleSelectLocalUser}
          onSignOutFirebase={async () => {
            await logoutFirebase();
            showToast('Signed out');
          }}
          onFirebaseConfigChanged={handleFirebaseConfigChanged}
        />
      )}

      {/* Hidden preload status list for exhaustive Tailwind classes */}
      <span className="sr-only">{STATUS_ORDER.join(',')}</span>
    </div>
  );
}

export default App;
