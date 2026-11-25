import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Check,
  Clock,
  Copy,
  History,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ACTIVE_STATUS_ORDER,
  isVehicleArchived,
  STATUS_META,
  VEHICLE_CHECKLIST_ITEMS,
  type HistoryEntry,
  type Vehicle,
  type VehicleChecklistKey,
  type VehicleStatus,
} from '../types/vehicle';
import {
  subscribeVehicleHistory,
  type NewVehicleInput,
} from '../services/vehicleService';
import { decodeVin } from '../services/vinDecoder';
import { formatCurrency, formatDateTime, formatRelativeTime } from '../utils/format';
import { triggerHaptic } from '../services/nativeBridge';
import { VehicleThumbnail } from './VehicleThumbnail';

interface VehicleDetailDrawerProps {
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (previous: Vehicle, updates: Partial<NewVehicleInput>) => Promise<void>;
  onToggleChecklist: (
    vehicle: Vehicle,
    key: VehicleChecklistKey,
    checked: boolean
  ) => Promise<void>;
  onDelete: (vehicleId: string) => Promise<void>;
}

export function VehicleDetailDrawer({
  vehicle,
  onClose,
  onSave,
  onToggleChecklist,
  onDelete,
}: VehicleDetailDrawerProps) {
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);
  const [photoUrl, setPhotoUrl] = useState<string>(vehicle.photoUrl ?? '');
  const [stockNumber, setStockNumber] = useState(vehicle.stockNumber ?? '');
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
  const dirtyFieldsRef = useRef<Set<keyof NewVehicleInput>>(new Set());

  const markDirty = (field: keyof NewVehicleInput) => {
    dirtyFieldsRef.current.add(field);
  };

  // Keep untouched form fields in sync when background 10s polls update this vehicle
  useEffect(() => {
    const dirty = dirtyFieldsRef.current;
    if (!dirty.has('status')) setStatus(vehicle.status);
    if (!dirty.has('photoUrl')) setPhotoUrl(vehicle.photoUrl ?? '');
    if (!dirty.has('stockNumber')) setStockNumber(vehicle.stockNumber ?? '');
    if (!dirty.has('vin')) setVin(vehicle.vin ?? '');
    if (!dirty.has('year')) setYear(String(vehicle.year));
    if (!dirty.has('make')) setMake(vehicle.make);
    if (!dirty.has('model')) setModel(vehicle.model);
    if (!dirty.has('trim')) setTrim(vehicle.trim ?? '');
    if (!dirty.has('color')) setColor(vehicle.color ?? '');
    if (!dirty.has('mileage')) {
      setMileage(vehicle.mileage !== undefined ? String(vehicle.mileage) : '');
    }
    if (!dirty.has('location')) setLocation(vehicle.location ?? '');
    if (!dirty.has('assignedTo')) setAssignedTo(vehicle.assignedTo ?? '');
    if (!dirty.has('estimatedCost')) {
      setEstimatedCost(
        vehicle.estimatedCost !== undefined ? String(vehicle.estimatedCost) : ''
      );
    }
    if (!dirty.has('expectedReturnDate')) {
      setExpectedReturnDate(vehicle.expectedReturnDate ?? '');
    }
    if (!dirty.has('repairNotes')) setRepairNotes(vehicle.repairNotes ?? '');
  }, [vehicle]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [copiedVin, setCopiedVin] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [statusBanner, setStatusBanner] = useState('');
  const [togglingKey, setTogglingKey] = useState<VehicleChecklistKey | null>(null);

  const wasArchived = isVehicleArchived(vehicle);
  const willArchive = !wasArchived && status === 'ready';
  const willRestore = wasArchived && status !== 'ready';
  const readyMeta = STATUS_META.ready;
  const completedChecklistCount = VEHICLE_CHECKLIST_ITEMS.filter((item) =>
    Boolean(vehicle.checklist?.[item.key])
  ).length;

  const handleChecklistToggle = async (key: VehicleChecklistKey) => {
    if (togglingKey) return;
    const nextChecked = !vehicle.checklist?.[key];
    triggerHaptic('light');
    setActionError('');
    setTogglingKey(key);
    try {
      await onToggleChecklist(vehicle, key, nextChecked);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to save checklist update.'
      );
    } finally {
      setTogglingKey(null);
    }
  };

  useEffect(() => {
    const unsub = subscribeVehicleHistory(vehicle.id, setHistory);
    return () => unsub();
  }, [vehicle.id]);

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
    if (res.year) {
      markDirty('year');
      setYear(String(res.year));
    }
    if (res.make) {
      markDirty('make');
      setMake(res.make);
    }
    if (res.model) {
      markDirty('model');
      setModel(res.model);
    }
    if (res.trim) {
      markDirty('trim');
      setTrim(res.trim);
    }
    triggerHaptic('success');
    setStatusBanner('VIN decoded from NHTSA.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dirty = dirtyFieldsRef.current;
    if (dirty.size === 0) {
      onClose();
      return;
    }

    const updates: Partial<NewVehicleInput> = {};
    if (dirty.has('stockNumber')) {
      updates.stockNumber = stockNumber.trim() ? stockNumber.trim().toUpperCase() : undefined;
    }
    if (dirty.has('vin')) {
      updates.vin = vin.trim() ? vin.trim().toUpperCase() : undefined;
    }
    if (dirty.has('year')) updates.year = Number(year) || vehicle.year;
    if (dirty.has('make')) updates.make = make.trim() || vehicle.make;
    if (dirty.has('model')) updates.model = model.trim() || vehicle.model;
    if (dirty.has('trim')) updates.trim = trim.trim() || undefined;
    if (dirty.has('color')) updates.color = color.trim() || undefined;
    if (dirty.has('mileage')) {
      updates.mileage = mileage.trim() ? Number(mileage.replace(/[^0-9]/g, '')) : undefined;
    }
    if (dirty.has('status')) updates.status = status;
    if (dirty.has('location')) updates.location = location.trim() || undefined;
    if (dirty.has('assignedTo')) updates.assignedTo = assignedTo.trim() || undefined;
    if (dirty.has('estimatedCost')) {
      updates.estimatedCost = estimatedCost.trim()
        ? Number(estimatedCost.replace(/[^0-9.]/g, ''))
        : undefined;
    }
    if (dirty.has('expectedReturnDate')) {
      updates.expectedReturnDate = expectedReturnDate || undefined;
    }
    if (dirty.has('repairNotes')) {
      updates.repairNotes = repairNotes.trim() || undefined;
    }
    if (dirty.has('photoUrl')) {
      updates.photoUrl = photoUrl;
    }

    setSaving(true);
    setActionError('');
    triggerHaptic('medium');
    try {
      await onSave(vehicle, updates);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save changes.');
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
            {(vehicle.stockNumber || wasArchived || vehicle.estimatedCost) && (
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {vehicle.stockNumber && (
                  <span className="font-mono-code text-xs font-semibold px-2 py-0.5 rounded-md bg-white/[0.07] text-slate-200">
                    {vehicle.stockNumber}
                  </span>
                )}
                {wasArchived && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                    <Archive className="w-3 h-3" />
                    Archived
                  </span>
                )}
                {vehicle.estimatedCost ? (
                  <span className="font-mono-code text-xs text-amber-300/90">
                    Est. {formatCurrency(vehicle.estimatedCost)}
                  </span>
                ) : null}
              </div>
            )}
            <h2 className="text-lg font-bold text-white tracking-tight truncate">
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
            {actionError && (
              <div className="rounded-xl bg-red-500/12 border border-red-400/25 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Vehicle Thumbnail Banner */}
            <VehicleThumbnail
              photoUrl={photoUrl || undefined}
              alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              size="banner"
              onPhotoChange={(dataUrl) => {
                markDirty('photoUrl');
                setPhotoUrl(dataUrl);
              }}
              onPhotoRemove={() => {
                markDirty('photoUrl');
                setPhotoUrl('');
              }}
            />

            {/* Quick Status Picker */}
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Current Status
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ACTIVE_STATUS_ORDER.map((st) => {
                  const meta = STATUS_META[st];
                  const active = st === status;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        markDirty('status');
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

              {/* Frontline Ready (Auto-Archive) Button */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  markDirty('status');
                  setStatus('ready');
                }}
                style={
                  status === 'ready'
                    ? {
                        backgroundColor: readyMeta.bgTint,
                        borderColor: readyMeta.borderTint,
                        color: readyMeta.color,
                      }
                    : undefined
                }
                className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  status === 'ready'
                    ? ''
                    : 'bg-[#0E121A] border-white/[0.08] text-slate-300 hover:border-emerald-400/35 hover:text-emerald-300'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Frontline Ready (Archive Vehicle)</span>
              </button>

              {willArchive && (
                <p className="text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  Saving as Frontline Ready will move this vehicle to the Archive.
                </p>
              )}

              {willRestore && (
                <p className="text-xs text-sky-300/90 bg-sky-500/10 border border-sky-400/20 rounded-xl px-3 py-2 flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  Saving will restore this vehicle from the Archive back to the Active Lot.
                </p>
              )}
            </div>

            {/* Prep Checklist (saves immediately & logs to Activity history) */}
            <div className="rounded-2xl bg-[#0D1119] border border-white/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Prep Checklist
                </span>
                <span className="font-mono-code text-[11px] font-semibold text-slate-400">
                  {completedChecklistCount}/{VEHICLE_CHECKLIST_ITEMS.length} Done
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VEHICLE_CHECKLIST_ITEMS.map((item) => {
                  const checked = Boolean(vehicle.checklist?.[item.key]);
                  const busy = togglingKey === item.key;
                  return (
                    <button
                      key={item.key}
                      id={`checklist-${item.key}`}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={togglingKey !== null}
                      onClick={() => handleChecklistToggle(item.key)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 ${
                        checked
                          ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-200'
                          : 'bg-[#121721] border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          checked
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                            : 'border-slate-500 bg-transparent'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : checked ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : null}
                      </span>
                      <span className="truncate">{item.label}</span>
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
                  onChange={(e) => {
                    markDirty('location');
                    setLocation(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('assignedTo');
                    setAssignedTo(e.target.value);
                  }}
                  placeholder="Team member"
                  className="field-input"
                />
              </div>
            </div>

            {/* Needs / Repair Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Needs / Repair Notes
              </label>
              <textarea
                rows={3}
                value={repairNotes}
                onChange={(e) => {
                  markDirty('repairNotes');
                  setRepairNotes(e.target.value);
                }}
                placeholder="What this vehicle needs (tune up, parts on order, body shop, keys...)"
                className="field-input resize-none"
              />
            </div>

            {/* Cost & Date Sent */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Est. Cost ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={estimatedCost}
                  onChange={(e) => {
                    markDirty('estimatedCost');
                    setEstimatedCost(e.target.value);
                  }}
                  className="field-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Date Sent
                </label>
                <input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => {
                    markDirty('expectedReturnDate');
                    setExpectedReturnDate(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('vin');
                    setVin(e.target.value.toUpperCase());
                  }}
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
                  Stock # <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={stockNumber}
                  onChange={(e) => {
                    markDirty('stockNumber');
                    setStockNumber(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('year');
                    setYear(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('make');
                    setMake(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('model');
                    setModel(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('trim');
                    setTrim(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('color');
                    setColor(e.target.value);
                  }}
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
                  onChange={(e) => {
                    markDirty('mileage');
                    setMileage(e.target.value);
                  }}
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
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 ${
                  willArchive
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                }`}
              >
                {saving
                  ? 'Saving Changes…'
                  : willArchive
                    ? 'Save & Archive Vehicle'
                    : willRestore
                      ? 'Save & Restore to Lot'
                      : 'Save Changes'}
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
                  className="rounded-xl bg-[#0D1119] border border-white/[0.07] p-3.5 space-y-2.5"
                >
                  {entry.changes && entry.changes.length > 0 ? (
                    <div className="space-y-1.5">
                      {entry.changes.map((chg, idx) => (
                        <div
                          key={`${entry.id}-c-${idx}`}
                          className="text-xs leading-relaxed flex flex-wrap items-baseline gap-1.5"
                        >
                          <span className="font-semibold text-sky-300 bg-sky-500/10 border border-sky-400/20 px-1.5 py-0.5 rounded-md shrink-0">
                            {chg.field}
                          </span>
                          {chg.from !== undefined && chg.to !== undefined ? (
                            <span className="inline-flex flex-wrap items-center gap-1.5 text-slate-200 break-words">
                              <span
                                className={
                                  chg.from === 'Empty' || chg.from === 'None'
                                    ? 'text-slate-500 italic'
                                    : 'text-slate-400 line-through decoration-slate-500/70'
                                }
                              >
                                {chg.from}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                              <span
                                className={
                                  chg.to === 'Cleared' || chg.to === 'Removed'
                                    ? 'text-amber-300/90 italic'
                                    : 'text-white font-medium'
                                }
                              >
                                {chg.to}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-100 font-medium break-words">
                              {chg.to ?? chg.from ?? ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-100 leading-snug">{entry.action}</p>
                  )}

                  <div className="pt-1.5 border-t border-white/[0.05] flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-300">{entry.userName}</span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={formatDateTime(entry.timestamp)}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(entry.timestamp)}</span>
                      <span className="text-slate-600">&bull;</span>
                      <span>{formatDateTime(entry.timestamp)}</span>
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
