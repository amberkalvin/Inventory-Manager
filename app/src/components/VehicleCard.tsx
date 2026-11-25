import { useState } from 'react';
import {
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckSquare,
  ChevronDown,
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

interface VehicleCardProps {
  vehicle: Vehicle;
  onSelect: (vehicle: Vehicle) => void;
  onQuickStatusChange: (vehicle: Vehicle, nextStatus: VehicleStatus) => Promise<void>;
  onQuickPhotoChange: (vehicle: Vehicle, dataUrl: string) => Promise<void>;
}

export function VehicleCard({
  vehicle,
  onSelect,
  onQuickStatusChange,
  onQuickPhotoChange,
}: VehicleCardProps) {
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
      className={`surface-card-interactive rounded-2xl p-4 cursor-pointer relative flex flex-col justify-between gap-3 ${
        menuOpen ? 'z-40' : 'z-0'
      }`}
    >
      {/* Top Row: Thumbnail + Stock # + Status Pill */}
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-3 min-w-0">
            <VehicleThumbnail
              photoUrl={vehicle.photoUrl}
              alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              size="md"
              onPhotoChange={(dataUrl) => onQuickPhotoChange(vehicle, dataUrl)}
            />
            <div className="min-w-0">
              {(vehicle.stockNumber || vehicle.vin) && (
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {vehicle.stockNumber && (
                    <span className="font-mono-code text-xs font-semibold px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-200 border border-white/[0.07]">
                      {vehicle.stockNumber}
                    </span>
                  )}
                  {vehicle.vin && (
                    <span className="font-mono-code text-[11px] text-slate-500">
                      …{vehicle.vin.slice(-6)}
                    </span>
                  )}
                </div>
              )}
              <h3 className="text-[15px] font-bold tracking-tight text-white leading-snug">
                {vehicle.year} {vehicle.make} {vehicle.model}
                {vehicle.trim ? (
                  <span className="font-medium text-slate-400"> {vehicle.trim}</span>
                ) : null}
              </h3>
            </div>
          </div>

          {/* Interactive Status Pill with Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
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
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer"
              aria-label={`Change status from ${meta.label}`}
            >
              <span>{meta.shortLabel}</span>
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
        </div>

        {/* Metadata Strip */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-slate-400">
          {vehicle.offsiteLocation && (
            <span className="inline-flex items-center gap-1.5 text-orange-300/90 font-medium">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[180px]">{vehicle.offsiteLocation}</span>
            </span>
          )}
          {vehicle.mileage !== undefined && (
            <span className="font-mono-code text-slate-400">
              {formatMileage(vehicle.mileage)}
            </span>
          )}
          {vehicle.color && <span>{vehicle.color}</span>}
          {vehicle.expectedReturnDate && !archived && (
            <span className="inline-flex items-center gap-1 text-amber-300/90">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              Sent {formatShortDate(vehicle.expectedReturnDate)}
            </span>
          )}
          {checklistDone > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-code text-emerald-300/90">
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              {checklistDone}/{VEHICLE_CHECKLIST_ITEMS.length}
            </span>
          )}
        </div>

        {/* Repair / Condition Notes */}
        {vehicle.repairNotes && (
          <p className="mt-2.5 text-xs text-slate-400 leading-relaxed line-clamp-2 flex items-start gap-1.5">
            <Wrench className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
            <span>{vehicle.repairNotes}</span>
          </p>
        )}
      </div>

      {/* Bottom Action Row: Accountability + One-Tap Advance */}
      <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500 truncate">
          {archived && vehicle.archivedAt
            ? `Archived ${formatRelativeTime(vehicle.archivedAt)} by `
            : `Updated ${formatRelativeTime(vehicle.updatedAt)} by `}
          <strong className="text-slate-300 font-medium">{vehicle.updatedBy}</strong>
        </span>

        <button
          type="button"
          disabled={updating}
          onClick={(e) => handleStatusUpdate(e, meta.nextStatus)}
          className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
            meta.nextStatus === 'ready'
              ? 'bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-300 border-emerald-400/25'
              : 'bg-white/[0.06] hover:bg-sky-500/20 hover:text-sky-300 text-slate-200 border-white/[0.08]'
          }`}
        >
          {archived ? (
            <RotateCcw className="w-3.5 h-3.5" />
          ) : meta.nextStatus === 'ready' ? (
            <Archive className="w-3.5 h-3.5" />
          ) : null}
          <span>{updating ? 'Saving…' : meta.nextLabel}</span>
          {!archived && meta.nextStatus !== 'ready' && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </article>
  );
}
