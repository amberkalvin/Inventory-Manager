import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CarFront,
  Cloud,
  CloudOff,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import { DEFAULT_TEAM_MEMBERS } from './data/mockVehicles';
import {
  getVehicleLabel,
  isVehicleArchived,
  STATUS_META,
  STATUS_ORDER,
  VEHICLE_CHECKLIST_ITEMS,
  type SyncState,
  type TeamUser,
  type Vehicle,
  type VehicleChecklistKey,
  type VehicleStatus,
} from './types/vehicle';
import {
  createVehicle,
  deleteVehicle,
  fetchVehiclesFromRemote,
  subscribeSyncState,
  subscribeVehicles,
  updateVehicle,
  type NewVehicleInput,
} from './services/vehicleService';
import { StatusSummaryBar, type StatusFilter } from './components/StatusSummaryBar';
import { VehicleCard } from './components/VehicleCard';
import { VehicleListRow } from './components/VehicleListRow';
import { QuickAddModal } from './components/QuickAddModal';
import { VehicleDetailDrawer } from './components/VehicleDetailDrawer';
import { SettingsModal } from './components/SettingsModal';
import { AuthGate, isShopPinUnlocked, lockShopPin } from './components/AuthGate';
import { triggerHaptic } from './services/nativeBridge';

const LOCAL_USER_KEY = 'im_local_user_v1';
const VIEW_MODE_KEY = 'im_view_mode_v1';

function loadViewMode(): 'cards' | 'list' {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

function loadLocalUser(): TeamUser {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; email?: string };
      if (parsed.name && parsed.email) {
        return { name: parsed.name, email: parsed.email };
      }
    }
  } catch {
    // Fallback to default member
  }
  return {
    name: DEFAULT_TEAM_MEMBERS[0].name,
    email: DEFAULT_TEAM_MEMBERS[0].email,
  };
}

export function App() {
  const [unlocked, setUnlocked] = useState<boolean>(isShopPinUnlocked);
  const [currentUser, setCurrentUser] = useState<TeamUser>(loadLocalUser);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [showArchive, setShowArchive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all_active');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(loadViewMode);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 2600);
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

  // Subscribe to Google Sheets polling (on load + every 10s) and sync state once unlocked
  useEffect(() => {
    if (!unlocked) return;
    const unsubState = subscribeSyncState(setSyncState);
    const unsubVehicles = subscribeVehicles((list) => {
      setVehicles(list);
      setSelectedVehicle((prev) =>
        prev ? list.find((v) => v.id === prev.id) ?? null : null
      );
    });
    return () => {
      unsubState();
      unsubVehicles();
    };
  }, [unlocked]);

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => !isVehicleArchived(v)),
    [vehicles]
  );

  const archivedVehicles = useMemo(
    () => vehicles.filter((v) => isVehicleArchived(v)),
    [vehicles]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<VehicleStatus, number> = {
      incoming: 0,
      minor_repair: 0,
      major_repair: 0,
      offsite: 0,
      ready: 0,
    };
    for (const v of vehicles) {
      if (isVehicleArchived(v)) {
        counts.ready++;
      } else if (counts[v.status] !== undefined) {
        counts[v.status]++;
      }
    }
    return counts;
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool = showArchive ? archivedVehicles : activeVehicles;

    return pool.filter((v) => {
      if (!showArchive && statusFilter !== 'all_active' && v.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        v.stockNumber ?? '',
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
  }, [activeVehicles, archivedVehicles, showArchive, statusFilter, searchQuery]);

  const suggestedStock = useMemo(() => {
    let maxNum = 1063;
    for (const v of vehicles) {
      if (!v.stockNumber) continue;
      const match = v.stockNumber.match(/(\d+)$/);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }
    return `STK-${maxNum + 1}`;
  }, [vehicles]);

  const handleSelectLocalUser = (name: string, email: string) => {
    const next: TeamUser = { name, email };
    setCurrentUser(next);
    try {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify({ name, email }));
    } catch {
      // Ignore storage errors
    }
    showToast(`Switched to ${name}`);
  };

  const handleLockApp = () => {
    lockShopPin();
    setUnlocked(false);
  };

  const handleToggleArchive = () => {
    triggerHaptic('light');
    setShowArchive((prev) => !prev);
    setSearchQuery('');
  };

  const handleQuickStatus = async (vehicle: Vehicle, nextStatus: VehicleStatus) => {
    const wasArchived = isVehicleArchived(vehicle);
    try {
      const changed = await updateVehicle(currentUser, vehicle, { status: nextStatus });
      if (!changed) return;
      const label = getVehicleLabel(vehicle);

      if (nextStatus === 'ready') {
        showToast(`${label} marked Frontline Ready & archived`);
      } else if (wasArchived) {
        showToast(`${label} restored to ${STATUS_META[nextStatus].label}`);
      } else {
        showToast(`${label} → ${STATUS_META[nextStatus].label}`);
      }
    } catch {
      showToast('Saved locally — cloud sync failed');
    }
  };

  const handleQuickPhoto = async (vehicle: Vehicle, dataUrl: string) => {
    try {
      const changed = await updateVehicle(currentUser, vehicle, { photoUrl: dataUrl });
      if (changed) {
        showToast(`Updated photo for ${getVehicleLabel(vehicle)}`);
      }
    } catch {
      showToast('Saved photo locally — cloud sync failed');
    }
  };

  const handleToggleChecklist = async (
    vehicle: Vehicle,
    key: VehicleChecklistKey,
    checked: boolean
  ) => {
    const nextChecklist = {
      ...(vehicle.checklist ?? {}),
      [key]: checked,
    };
    const changed = await updateVehicle(currentUser, vehicle, {
      checklist: nextChecklist,
    });
    if (changed) {
      const label =
        VEHICLE_CHECKLIST_ITEMS.find((item) => item.key === key)?.label ?? key;
      showToast(
        `${getVehicleLabel(vehicle)}: ${label} ${checked ? 'checked' : 'unchecked'}`
      );
    }
  };

  const handleToggleViewMode = (mode: 'cards' | 'list') => {
    triggerHaptic('light');
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const handleCreateVehicle = async (input: NewVehicleInput) => {
    await createVehicle(currentUser, input);
    const label = getVehicleLabel(input);
    if (input.status === 'ready') {
      showToast(`Added ${label} to Archive (Frontline Ready)`);
    } else {
      showToast(`Added ${label}`);
    }
  };

  const handleSaveVehicle = async (
    previous: Vehicle,
    updates: Partial<NewVehicleInput>
  ) => {
    const wasArchived = isVehicleArchived(previous);
    const nextStatus = updates.status ?? previous.status;
    const changed = await updateVehicle(currentUser, previous, updates);
    if (!changed) {
      showToast('No changes to save');
      return;
    }

    const label = getVehicleLabel({
      stockNumber: 'stockNumber' in updates ? updates.stockNumber : previous.stockNumber,
      year: updates.year ?? previous.year,
      make: updates.make ?? previous.make,
      model: updates.model ?? previous.model,
    });
    if (!wasArchived && nextStatus === 'ready') {
      showToast(`${label} marked Frontline Ready & archived`);
    } else if (wasArchived && nextStatus !== 'ready') {
      showToast(`${label} restored to ${STATUS_META[nextStatus].label}`);
    } else {
      showToast(`Saved changes to ${label}`);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    await deleteVehicle(vehicleId);
    showToast('Removed vehicle from inventory');
  };

  // Require 4-digit shop PIN until stored in localStorage
  if (!unlocked) {
    return <AuthGate onUnlocked={() => setUnlocked(true)} />;
  }

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
                {syncState.status === 'syncing' ? (
                  <span className="inline-flex items-center gap-1 text-sky-400 font-medium">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Syncing…
                  </span>
                ) : syncState.status === 'error' ? (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <CloudOff className="w-3 h-3" />
                    Sync Issue
                  </span>
                ) : !isOnline || syncState.status === 'offline' ? (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <CloudOff className="w-3 h-3" />
                    Offline
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <Cloud className="w-3 h-3" />
                    Live Sync
                  </span>
                )}
                <span>&bull;</span>
                <span className="truncate">{currentUser.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="toggle-archive-btn"
              type="button"
              onClick={handleToggleArchive}
              aria-pressed={showArchive}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                showArchive
                  ? 'bg-emerald-500/18 border-emerald-400/40 text-emerald-300'
                  : 'bg-white/[0.06] hover:bg-white/10 border-white/[0.08] text-slate-200'
              }`}
              title={showArchive ? 'Back to Active Lot' : 'View Archived Vehicles'}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
              <span
                className={`font-mono-code text-[11px] px-1.5 py-0.2 rounded-md ${
                  showArchive
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {archivedVehicles.length}
              </span>
            </button>

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
            <span>Offline lot mode active — updates are cached locally until signal returns.</span>
          </div>
        )}

        {/* Sync Error Banner */}
        {syncState.status === 'error' && syncState.error && (
          <div className="rounded-xl bg-red-500/12 border border-red-400/25 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-red-200">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span className="break-words">{syncState.error}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchVehiclesFromRemote()}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Archive Header Banner OR Active Lot Status Summary Bar */}
        {showArchive ? (
          <section
            aria-label="Archive header"
            className="rounded-2xl bg-emerald-500/10 border border-emerald-400/25 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-300 shrink-0">
                <Archive className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white">
                  Frontline Ready Archive ({archivedVehicles.length})
                </h2>
                <p className="text-xs text-slate-300/80">
                  Vehicles marked Frontline Ready are stored here and hidden from the active lot.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleArchive}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/14 text-xs font-semibold text-white cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Active Lot
            </button>
          </section>
        ) : (
          <StatusSummaryBar
            counts={statusCounts}
            activeCount={activeVehicles.length}
            selected={statusFilter}
            onSelect={setStatusFilter}
          />
        )}

        {/* Instant Search Bar + Cards/List Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="inventory-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                showArchive
                  ? 'Search archived vehicles by Stock #, VIN, Make, Model, or Location…'
                  : 'Search active lot by Stock #, last 6 of VIN, Make, Model, or Location…'
              }
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

          <div
            role="group"
            aria-label="View layout"
            className="shrink-0 flex items-center p-1 rounded-xl bg-[#0E121A] border border-white/[0.08]"
          >
            <button
              id="view-mode-cards"
              type="button"
              onClick={() => handleToggleViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              title="Card view"
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#1D283A] text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              id="view-mode-list"
              type="button"
              onClick={() => handleToggleViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title="List view"
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#1D283A] text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {/* Active Filter Label */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
          <span>
            Showing <strong className="text-slate-200">{filteredVehicles.length}</strong>{' '}
            {filteredVehicles.length === 1 ? 'vehicle' : 'vehicles'}
            {showArchive
              ? ' in Archive'
              : statusFilter !== 'all_active'
                ? ` in ${STATUS_META[statusFilter].label}`
                : ' on active lot'}
          </span>
          {((!showArchive && statusFilter !== 'all_active') || searchQuery) && (
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

        {/* Vehicle Cards Grid or Compact List */}
        {filteredVehicles.length === 0 ? (
          <div className="surface-card rounded-2xl py-14 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] mx-auto flex items-center justify-center text-slate-400">
              {showArchive ? <Archive className="w-6 h-6" /> : <CarFront className="w-6 h-6" />}
            </div>
            <h2 className="text-base font-bold text-white">
              {showArchive
                ? searchQuery
                  ? 'No archived vehicles match your search'
                  : 'Archive is empty'
                : 'No vehicles match this view'}
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {showArchive
                ? 'When a vehicle is marked Frontline Ready, it moves here automatically.'
                : 'Clear your search filter or tap Add Vehicle to log a new unit with instant VIN decoding.'}
            </p>
            {showArchive ? (
              <button
                type="button"
                onClick={handleToggleArchive}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/14 text-white font-semibold text-xs cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Active Lot
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Vehicle
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <section aria-label="Vehicle list" className="flex flex-col gap-2">
            {filteredVehicles.map((vehicle) => (
              <VehicleListRow
                key={vehicle.id}
                vehicle={vehicle}
                onSelect={setSelectedVehicle}
                onQuickStatusChange={handleQuickStatus}
                onQuickPhotoChange={handleQuickPhoto}
              />
            ))}
          </section>
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
                onQuickPhotoChange={handleQuickPhoto}
              />
            ))}
          </section>
        )}
      </main>

      {/* Mobile Floating Action Button (+ Add Vehicle) */}
      {!showArchive && (
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
      )}

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
          key={selectedVehicle.id}
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
          onSave={handleSaveVehicle}
          onToggleChecklist={handleToggleChecklist}
          onDelete={handleDeleteVehicle}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={currentUser}
          vehicles={vehicles}
          syncState={syncState}
          onClose={() => setShowSettings(false)}
          onSelectLocalUser={handleSelectLocalUser}
          onLockApp={handleLockApp}
        />
      )}

      {/* Hidden preload status list for exhaustive Tailwind classes */}
      <span className="sr-only">{STATUS_ORDER.join(',')}</span>
    </div>
  );
}

export default App;
