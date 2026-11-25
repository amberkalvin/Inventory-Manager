import { useState } from 'react';
import { Archive, ArrowRight, CheckSquare, ChevronDown, MapPin, RotateCcw } from 'lucide-react';
import {
  isVehicleArchived,
  STATUS_META,
  STATUS_ORDER,
  VEHICLE_CHECKLIST_ITEMS,
  type Vehicle,
  type VehicleStatus,
} from '../types/vehicle';
import { formatMileage, formatRelativeTime } from '../utils/format';
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
      onClick={() => {
        triggerHaptic('light');
        onSelect(vehicle);
      }}
      className="surface-card-interactive rounded-xl px-3 py-2.5 cursor-pointer relative flex items-center gap-3"
    >
      {/* Thumbnail with 1-tap camera upload/swap */}
      <VehicleThumbnail
        photoUrl={vehicle.photoUrl}
        alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        size="sm"
        onPhotoChange={(dataUrl) => onQuickPhotoChange(vehicle, dataUrl)}
      />

      {/* Primary Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono-code text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-200 border border-white/[0.07] shrink-0">
            {vehicle.stockNumber}
          </span>
          <h3 className="text-sm font-bold text-white truncate">
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.trim ? (
              <span className="font-normal text-slate-400"> {vehicle.trim}</span>
            ) : null}
          </h3>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          {vehicle.location && (
            <span className="inline-flex items-center gap-1 text-slate-300 font-medium truncate max-w-[160px] sm:max-w-xs">
              <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="truncate">{vehicle.location}</span>
            </span>
          )}
          {vehicle.mileage !== undefined && (
            <span className="hidden sm:inline font-mono-code text-slate-400">
              {formatMileage(vehicle.mileage)}
            </span>
          )}
          {vehicle.color && (
            <span className="hidden md:inline">{vehicle.color}</span>
          )}
          {checklistDone > 0 && (
            <span className="inline-flex items-center gap-1 font-mono-code text-emerald-300/90">
              <CheckSquare className="w-3 h-3 shrink-0" />
              {checklistDone}/{VEHICLE_CHECKLIST_ITEMS.length}
            </span>
          )}
          <span className="text-slate-500 truncate">
            {archived && vehicle.archivedAt
              ? `Archived ${formatRelativeTime(vehicle.archivedAt)}`
              : formatRelativeTime(vehicle.updatedAt)}{' '}
            · {vehicle.updatedBy}
          </span>
        </div>
      </div>

      {/* Right Controls: Status Dropdown + Desktop 1-Tap Advance */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
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
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer"
            aria-label={`Change status from ${meta.label}`}
          >
            <span>{meta.shortLabel}</span>
            <ChevronDown className="w-3 h-3 opacity-80" />
          </button>

          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 mt-1.5 w-52 rounded-xl bg-[#182030] border border-white/15 shadow-2xl p-1.5 z-30"
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
          )}
        </div>

        <button
          type="button"
          disabled={updating}
          onClick={(e) => handleStatusUpdate(e, meta.nextStatus)}
          title={meta.nextLabel}
          className={`hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
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
          <span>{updating ? '…' : meta.nextLabel}</span>
          {!archived && meta.nextStatus !== 'ready' && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </article>
  );
}
