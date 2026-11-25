import { useState } from 'react';
import { Archive, Loader2, Search, X } from 'lucide-react';
import { ACTIVE_STATUS_ORDER, STATUS_META, type VehicleStatus } from '../types/vehicle';
import type { NewVehicleInput } from '../services/vehicleService';
import { decodeVin } from '../services/vinDecoder';
import { triggerHaptic } from '../services/nativeBridge';
import { VehicleThumbnail } from './VehicleThumbnail';

interface QuickAddModalProps {
  suggestedStock: string;
  defaultAssignee: string;
  onClose: () => void;
  onSubmit: (input: NewVehicleInput) => Promise<void>;
}

export function QuickAddModal({
  suggestedStock,
  defaultAssignee,
  onClose,
  onSubmit,
}: QuickAddModalProps) {
  const [vin, setVin] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [vinMessage, setVinMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [stockNumber, setStockNumber] = useState('');
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [color, setColor] = useState('');
  const [mileage, setMileage] = useState('');
  const [status, setStatus] = useState<VehicleStatus>('incoming');
  const [location, setLocation] = useState('Main Lot');
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [repairNotes, setRepairNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const readyMeta = STATUS_META.ready;

  const handleDecodeVin = async () => {
    triggerHaptic('light');
    setDecoding(true);
    setVinMessage(null);
    const result = await decodeVin(vin);
    setDecoding(false);

    if (result.error) {
      setVinMessage({ type: 'err', text: result.error });
      return;
    }

    if (result.year) setYear(String(result.year));
    if (result.make) setMake(result.make);
    if (result.model) setModel(result.model);
    if (result.trim) setTrim(result.trim);
    triggerHaptic('success');
    setVinMessage({
      type: 'ok',
      text: `Decoded ${[result.year, result.make, result.model, result.trim].filter(Boolean).join(' ')}`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!make.trim() || !model.trim()) {
      setFormError('Year, Make, and Model are required.');
      return;
    }

    const parsedYear = Number(year);
    if (!Number.isFinite(parsedYear) || parsedYear < 1950 || parsedYear > 2035) {
      setFormError('Enter a valid model year.');
      return;
    }

    setSaving(true);
    triggerHaptic('medium');
    try {
      await onSubmit({
        stockNumber: stockNumber.trim() ? stockNumber.trim().toUpperCase() : undefined,
        vin: vin.trim() ? vin.trim().toUpperCase() : undefined,
        year: parsedYear,
        make: make.trim(),
        model: model.trim(),
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
        photoUrl: photoUrl || undefined,
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save vehicle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-[#121721] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Add Vehicle</h2>
            <p className="text-xs text-slate-400">Snap a photo, decode a VIN, or enter details manually</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-slate-300 cursor-pointer"
            aria-label="Close add vehicle modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Vehicle Thumbnail Upload */}
          <VehicleThumbnail
            photoUrl={photoUrl || undefined}
            alt="New vehicle photo"
            size="banner"
            onPhotoChange={(dataUrl) => setPhotoUrl(dataUrl)}
            onPhotoRemove={() => setPhotoUrl('')}
          />

          {/* VIN Auto-Decode Bar */}
          <div className="rounded-xl bg-[#0D1119] border border-white/[0.08] p-3">
            <label htmlFor="add-vin" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              17-Character VIN (Auto-Fill via NHTSA)
            </label>
            <div className="flex gap-2">
              <input
                id="add-vin"
                type="text"
                maxLength={17}
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="e.g. 1FTFW1E85MFA48219"
                className="field-input font-mono-code uppercase tracking-wider text-sm"
              />
              <button
                type="button"
                disabled={decoding || vin.trim().length < 11}
                onClick={handleDecodeVin}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                {decoding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Decode
              </button>
            </div>
            {vinMessage && (
              <p
                className={`mt-2 text-xs font-medium ${
                  vinMessage.type === 'ok' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {vinMessage.text}
              </p>
            )}
          </div>

          {/* Status Pill Selector */}
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Initial Status
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ACTIVE_STATUS_ORDER.map((st) => {
                const stMeta = STATUS_META[st];
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
                            backgroundColor: stMeta.bgTint,
                            borderColor: stMeta.borderTint,
                            color: stMeta.color,
                          }
                        : undefined
                    }
                    className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? ''
                        : 'bg-[#0E121A] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {stMeta.shortLabel}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
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
              className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                status === 'ready'
                  ? ''
                  : 'bg-[#0E121A] border-white/[0.08] text-slate-400 hover:border-emerald-400/35 hover:text-emerald-300'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Frontline Ready (Add Directly to Archive)</span>
            </button>
            {status === 'ready' && (
              <p className="text-xs text-emerald-300/90">
                Vehicles added as Frontline Ready are saved straight to the Archive.
              </p>
            )}
          </div>

          {/* Core Vehicle Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-year" className="block text-xs font-medium text-slate-400 mb-1">
                Year *
              </label>
              <input
                id="add-year"
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="field-input font-mono-code"
              />
            </div>
            <div>
              <label htmlFor="add-stock" className="block text-xs font-medium text-slate-400 mb-1">
                Stock # <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                id="add-stock"
                type="text"
                placeholder={suggestedStock ? `e.g. ${suggestedStock}` : 'Optional'}
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                className="field-input font-mono-code uppercase"
              />
            </div>
            <div>
              <label htmlFor="add-make" className="block text-xs font-medium text-slate-400 mb-1">
                Make *
              </label>
              <input
                id="add-make"
                type="text"
                required
                placeholder="Ford"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-model" className="block text-xs font-medium text-slate-400 mb-1">
                Model *
              </label>
              <input
                id="add-model"
                type="text"
                required
                placeholder="F-150"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-trim" className="block text-xs font-medium text-slate-400 mb-1">
                Trim
              </label>
              <input
                id="add-trim"
                type="text"
                placeholder="XLT 4WD"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-color" className="block text-xs font-medium text-slate-400 mb-1">
                Color
              </label>
              <input
                id="add-color"
                type="text"
                placeholder="Silver"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-mileage" className="block text-xs font-medium text-slate-400 mb-1">
                Mileage
              </label>
              <input
                id="add-mileage"
                type="number"
                inputMode="numeric"
                placeholder="48500"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="field-input font-mono-code"
              />
            </div>
            <div>
              <label htmlFor="add-location" className="block text-xs font-medium text-slate-400 mb-1">
                Location / Shop
              </label>
              <input
                id="add-location"
                type="text"
                placeholder="Main Lot"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-assigned" className="block text-xs font-medium text-slate-400 mb-1">
                Assigned To
              </label>
              <input
                id="add-assigned"
                type="text"
                placeholder="Team member"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="add-cost" className="block text-xs font-medium text-slate-400 mb-1">
                Est. Repair Cost ($)
              </label>
              <input
                id="add-cost"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="field-input font-mono-code"
              />
            </div>
          </div>

          <div>
            <label htmlFor="add-eta" className="block text-xs font-medium text-slate-400 mb-1">
              Expected Return / Arrival Date
            </label>
            <input
              id="add-eta"
              type="date"
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="add-notes" className="block text-xs font-medium text-slate-400 mb-1">
              Repair &amp; Recon Notes
            </label>
            <textarea
              id="add-notes"
              rows={3}
              placeholder="List repairs, body shop notes, key count, or recon steps..."
              value={repairNotes}
              onChange={(e) => setRepairNotes(e.target.value)}
              className="field-input resize-none"
            />
          </div>

          {formError && (
            <p className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          <div
            className="pt-2 pb-2 flex gap-2.5 sticky bottom-0 bg-[#121721]"
            style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 font-semibold text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Adding Vehicle…' : 'Save Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
