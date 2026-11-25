import { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  History,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  STATUS_META,
  STATUS_ORDER,
  type HistoryEntry,
  type Vehicle,
  type VehicleStatus,
} from '../types/vehicle';
import {
  subscribeVehicleHistory,
  type NewVehicleInput,
} from '../services/vehicleService';
import { decodeVin } from '../services/vinDecoder';
import { formatCurrency, formatRelativeTime } from '../utils/format';
import { triggerHaptic } from '../services/nativeBridge';
import { VehicleThumbnail } from './VehicleThumbnail';

interface VehicleDetailDrawerProps {
  vehicle: Vehicle;
  mode: 'firebase' | 'local';
  onClose: () => void;
  onSave: (previous: Vehicle, updates: Partial<NewVehicleInput>) => Promise<void>;
  onDelete: (vehicleId: string) => Promise<void>;
}

export function VehicleDetailDrawer({
  vehicle,
  mode,
  onClose,
  onSave,
  onDelete,
}: VehicleDetailDrawerProps) {
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);
  const [photoUrl, setPhotoUrl] = useState<string>(vehicle.photoUrl ?? '');
  const [stockNumber, setStockNumber] = useState(vehicle.stockNumber);
  const [vin, setVin] = useState(vehicle.vin ?? '');
  const [year, setYear] = useState(String(vehicle.year));
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [trim, setTrim] = useState(vehicle.trim ?? '');
  const [color, setColor] = useState(vehicle.color ?? '');
  const [mileage, setMileage] = useState(
    vehicle.mileage !== undefined ? String(vehicle.mileage) : ''
  );
  const [location, setLocation] = useState(vehicle.location ?? '');
  const [assignedTo, setAssignedTo] = useState(vehicle.assignedTo ?? '');
  const [estimatedCost, setEstimatedCost] = useState(
    vehicle.estimatedCost !== undefined ? String(vehicle.estimatedCost) : ''
  );
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    vehicle.expectedReturnDate ?? ''
  );
  const [repairNotes, setRepairNotes] = useState(vehicle.repairNotes ?? '');

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [copiedVin, setCopiedVin] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [statusBanner, setStatusBanner] = useState('');

  useEffect(() => {
    const unsub = subscribeVehicleHistory(mode, vehicle.id, setHistory);
    return () => unsub();
  }, [mode, vehicle.id]);

  const handleCopyVin = async () => {
    if (!vin) return;
    try {
      await navigator.clipboard.writeText(vin);
      triggerHaptic('light');
      setCopiedVin(true);
      setTimeout(() => setCopiedVin(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDecodeVin = async () => {
    setDecoding(true);
    const res = await decodeVin(vin);
    setDecoding(false);
    if (res.error) {
      setStatusBanner(res.error);
      return;
    }
    if (res.year) setYear(String(res.year));
    if (res.make) setMake(res.make);
    if (res.model) setModel(res.model);
    if (res.trim) setTrim(res.trim);
    triggerHaptic('success');
    setStatusBanner('VIN decoded from NHTSA.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    triggerHaptic('medium');
    try {
      await onSave(vehicle, {
        stockNumber: stockNumber.trim().toUpperCase(),
        vin: vin.trim() ? vin.trim().toUpperCase() : undefined,
        year: Number(year) || vehicle.year,
        make: make.trim() || vehicle.make,
        model: model.trim() || vehicle.model,
        trim: trim.trim() || undefined,
        color: color.trim() || undefined,
        mileage: mileage.trim() ? Number(mileage.replace(/[^0-9]/g, '')) : undefined,
        status,
        location: location.trim() || undefined,
        assignedTo: assignedTo.trim() || undefined,
        estimatedCost: estimatedCost.trim()
          ? Number(estimatedCost.replace(/[^0-9.]/g, ''))
          : undefined,
        expectedReturnDate: expectedReturnDate || undefined,
        repairNotes: repairNotes.trim() || undefined,
        photoUrl: photoUrl,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      triggerHaptic('light');
      return;
    }
    triggerHaptic('medium');
    await onDelete(vehicle.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet w-full sm:max-w-lg max-h-[94vh] sm:max-h-full bg-[#121721] border-t sm:border-t-0 sm:border-l border-white/10 rounded-t-3xl sm:rounded-none flex flex-col shadow-2xl"
      >
        {/* Top Drawer Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono-code text-xs font-semibold px-2 py-0.5 rounded-md bg-white/[0.07] text-slate-200">
                {vehicle.stockNumber}
              </span>
              {vehicle.estimatedCost ? (
                <span className="font-mono-code text-xs text-amber-300/90">
                  Est. {formatCurrency(vehicle.estimatedCost)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 text-lg font-bold text-white tracking-tight truncate">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h2>
            <p className="text-xs text-slate-400">
              Last updated {formatRelativeTime(vehicle.updatedAt)} by {vehicle.updatedBy}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-slate-300 shrink-0 cursor-pointer"
            aria-label="Close detail drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details / History Segmented Control */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0B0E14] border border-white/[0.07]">
            <button
              type="button"
              onClick={() => setTab('details')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'details' ? 'bg-[#1D2536] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Details &amp; Edit
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'history' ? 'bg-[#1D2536] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Activity ({history.length})
            </button>
          </div>
        </div>

        {tab === 'details' ? (
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Vehicle Thumbnail Banner */}
            <VehicleThumbnail
              photoUrl={photoUrl || undefined}
              alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              size="banner"
              onPhotoChange={(dataUrl) => setPhotoUrl(dataUrl)}
              onPhotoRemove={() => setPhotoUrl('')}
            />

            {/* Quick Status Picker */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Current Status
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_ORDER.map((st) => {
                  const meta = STATUS_META[st];
                  const active = st === status;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setStatus(st);
                      }}
                      style={
                        active
                          ? {
                              backgroundColor: meta.bgTint,
                              borderColor: meta.borderTint,
                              color: meta.color,
                            }
                          : undefined
                      }
                      className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? ''
                          : 'bg-[#0E121A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {meta.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Location & Assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Location / Shop
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Main Lot / Shop"
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Assigned To
                </label>
                <input
                  type="text"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Team member"
                  className="field-input"
                />
              </div>
            </div>

            {/* Repair Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Repair &amp; Recon Notes
              </label>
              <textarea
                rows={3}
                value={repairNotes}
                onChange={(e) => setRepairNotes(e.target.value)}
                placeholder="Notes on repairs, parts on order, body shop, keys..."
                className="field-input resize-none"
              />
            </div>

            {/* Cost & ETA */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Est. Cost ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  className="field-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Expected Return / ETA
                </label>
                <input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  className="field-input"
                />
              </div>
            </div>

            {/* VIN with Copy + Decode */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                VIN
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={17}
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  className="field-input font-mono-code uppercase text-sm"
                />
                {vin && (
                  <button
                    type="button"
                    onClick={handleCopyVin}
                    title="Copy VIN"
                    className="shrink-0 w-11 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
                  >
                    {copiedVin ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  disabled={decoding || vin.trim().length < 11}
                  onClick={handleDecodeVin}
                  title="Decode VIN"
                  className="shrink-0 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 disabled:opacity-40 flex items-center justify-center text-sky-400 cursor-pointer"
                >
                  {decoding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
              {statusBanner && (
                <p className="mt-1.5 text-xs text-sky-400">{statusBanner}</p>
              )}
            </div>

            {/* Vehicle Specs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Stock #
                </label>
                <input
                  type="text"
                  value={stockNumber}
                  onChange={(e) => setStockNumber(e.target.value)}
                  className="field-input font-mono-code uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="field-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Make
                </label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Trim
                </label>
                <input
                  type="text"
                  value={trim}
                  onChange={(e) => setTrim(e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Color
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="field-input"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Mileage
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className="field-input font-mono-code"
                />
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div
              className="pt-3 flex items-center gap-2.5 sticky bottom-0 bg-[#121721]"
              style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={handleDelete}
                className={`px-3.5 py-3 rounded-xl font-semibold text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  confirmDelete
                    ? 'bg-red-500 text-white'
                    : 'bg-red-500/12 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {confirmDelete ? 'Confirm' : ''}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving Changes…' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No activity logged yet for this vehicle.
              </div>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[#0D1119] border border-white/[0.07] p-3.5"
                >
                  <p className="text-sm text-slate-100 leading-snug">{entry.action}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-400">{entry.userName}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
