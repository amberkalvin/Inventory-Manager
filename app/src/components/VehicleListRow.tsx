import { useState } from 'react';
import {
  CalendarClock,
  CheckSquare,
  ChevronDown,
  MapPin,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import {
  isVehicleArchived,
  STATUS_META,
  STATUS_ORDER,
  VEHICLE_CHECKLIST_ITEMS,
  type Vehicle,
  type VehicleStatus,
} from '../types/vehicle';
import { formatMileage, formatRelativeTime, formatShortDate } from '../utils/format';
import { triggerHaptic } from '../services/nativeBridge';
import { VehicleThumbnail } from './VehicleThumbnail';

interface VehicleListRowProps {
  vehicle: Vehicle;
  onSelect: (vehicle: Vehicle) => void;
  onQuickStatusChange: (vehicle: Vehicle, nextStatus: VehicleStatus) => Promise<void>;
  onQuickPhotoChange: (vehicle: Vehicle, dataUrl: string) => Promise<void>;
}

export function VehicleListRow({
  vehicle,
  onSelect,
  onQuickStatusChange,
  onQuickPhotoChange,
}: VehicleListRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const meta = STATUS_META[vehicle.status];
  const archived = isVehicleArchived(vehicle);
  const checklistDone = VEHICLE_CHECKLIST_ITEMS.filter((item) =>
    Boolean(vehicle.checklist?.[item.key])
  ).length;

  const handleStatusUpdate = async (
    e: React.MouseEvent,
    nextStatus: VehicleStatus
  ) => {
    e.stopPropagation();
    if (updating || nextStatus === vehicle.status) {
      setMenuOpen(false);
      return;
    }
    triggerHaptic('medium');
    setUpdating(true);
    setMenuOpen(false);
    try {
      await onQuickStatusChange(vehicle, nextStatus);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <article
      data-menu-open={menuOpen ? 'true' : undefined}
      onClick={() => {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        triggerHaptic('light');
        onSelect(vehicle);
      }}
      className={`surface-card-interactive rounded-xl px-3.5 py-3 cursor-pointer relative flex items-start gap-3 ${
        menuOpen ? 'z-40' : 'z-0'
      }`}
    >
      {/* Thumbnail with 1-tap camera upload/swap */}
      <div className="pt-0.5 shrink-0">
        <VehicleThumbnail
          photoUrl={vehicle.photoUrl}
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          size="md"
          onPhotoChange={(dataUrl) => onQuickPhotoChange(vehicle, dataUrl)}
        />
      </div>

      {/* Primary Info + Needed Repairs + Offsite Location */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {vehicle.stockNumber && (
              <span className="font-mono-code text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-200 border border-white/[0.07] shrink-0">
                {vehicle.stockNumber}
              </span>
            )}
            <h3 className="text-[15px] font-bold text-white leading-snug">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim ? (
                <span className="font-normal text-slate-400"> {vehicle.trim}</span>
              ) : null}
            </h3>
          </div>

          {/* Right Controls: Status Dropdown (+ Restore when in Archive) */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                disabled={updating}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  setMenuOpen((prev) => !prev);
                }}
                style={{
                  color: meta.color,
                  backgroundColor: meta.bgTint,
                  borderColor: meta.borderTint,
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer disabled:opacity-50"
                aria-label={`Change status from ${meta.label}`}
              >
                <span>{updating ? '…' : meta.shortLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 mt-1.5 w-52 rounded-xl bg-[#182030] border border-white/15 shadow-2xl p-1.5 z-50"
                  >
                    {STATUS_ORDER.map((st) => {
                      const stMeta = STATUS_META[st];
                      const active = st === vehicle.status;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={(e) => handleStatusUpdate(e, st)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors ${
                            active
                              ? 'bg-white/10 text-white'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: stMeta.color }}
                            />
                            {stMeta.label}
                          </span>
                          {st === 'ready' && !archived && (
                            <span className="text-[10px] text-emerald-400/90 font-semibold">
                              Archive
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {archived && (
              <button
                type="button"
                disabled={updating}
                onClick={(e) => handleStatusUpdate(e, meta.nextStatus)}
                title={meta.nextLabel}
                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-sky-500/20 hover:text-sky-300 text-slate-200 border border-white/[0.08] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{updating ? '…' : meta.nextLabel}</span>
              </button>
            )}
          </div>
        </div>

        {/* Bright, Easy-to-Read Needed Repairs */}
        {vehicle.repairNotes && (
          <p className="text-[13px] font-medium text-slate-100 leading-snug line-clamp-3 flex items-start gap-1.5">
            <Wrench className="w-3.5 h-3.5 mt-0.5 text-amber-300 shrink-0" />
            <span>{vehicle.repairNotes}</span>
          </p>
        )}

        {/* Location + Metadata Strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {vehicle.offsiteLocation && (
            <span className="inline-flex items-center gap-1 text-orange-300 font-semibold">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[200px] sm:max-w-xs">
                {vehicle.offsiteLocation}
              </span>
            </span>
          )}
          {vehicle.expectedReturnDate && !archived && (
            <span className="inline-flex items-center gap-1 text-amber-300/90">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              Sent {formatShortDate(vehicle.expectedReturnDate)}
            </span>
          )}
          {vehicle.mileage !== undefined && (
            <span className="font-mono-code text-slate-300/90">
              {formatMileage(vehicle.mileage)}
            </span>
          )}
          {vehicle.color && <span className="text-slate-300/80">{vehicle.color}</span>}
          {checklistDone > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-code text-emerald-300/90">
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              {checklistDone}/{VEHICLE_CHECKLIST_ITEMS.length}
            </span>
          )}
          <span className="text-[11px] text-slate-500">
            {archived && vehicle.archivedAt
              ? `Archived ${formatRelativeTime(vehicle.archivedAt)}`
              : formatRelativeTime(vehicle.updatedAt)}{' '}
            · {vehicle.updatedBy}
          </span>
        </div>
      </div>
    </article>
  );
}
