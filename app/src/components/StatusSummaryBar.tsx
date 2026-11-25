import { ACTIVE_STATUS_ORDER, STATUS_META, type VehicleStatus } from '../types/vehicle';
import { triggerHaptic } from '../services/nativeBridge';

export type StatusFilter = 'all_active' | Exclude<VehicleStatus, 'ready'>;

interface StatusSummaryBarProps {
  counts: Record<VehicleStatus, number>;
  activeCount: number;
  selected: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
}

export function StatusSummaryBar({
  counts,
  activeCount,
  selected,
  onSelect,
}: StatusSummaryBarProps) {
  const handlePick = (next: StatusFilter) => {
    triggerHaptic('light');
    onSelect(next);
  };

  return (
    <section aria-label="Inventory status counts" className="w-full">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-5">
        <button
          id="filter-all-active"
          type="button"
          onClick={() => handlePick('all_active')}
          className={`shrink-0 min-w-[96px] sm:min-w-0 text-left rounded-xl px-3.5 py-2.5 border transition-all cursor-pointer ${
            selected === 'all_active'
              ? 'bg-[#1D283A] border-sky-400/50 text-white'
              : 'surface-card text-slate-300 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Active Lot
            </span>
            <span className="w-2 h-2 rounded-full bg-sky-400" />
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight font-mono-code text-white">
            {activeCount}
          </div>
        </button>

        {ACTIVE_STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          const isSelected = selected === status;
          return (
            <button
              key={status}
              id={`filter-${status}`}
              type="button"
              onClick={() =>
                handlePick(isSelected ? 'all_active' : (status as Exclude<VehicleStatus, 'ready'>))
              }
              style={
                isSelected
                  ? {
                      backgroundColor: meta.bgTint,
                      borderColor: meta.borderTint,
                    }
                  : undefined
              }
              className={`shrink-0 min-w-[98px] sm:min-w-0 text-left rounded-xl px-3.5 py-2.5 border transition-all cursor-pointer ${
                isSelected ? 'text-white' : 'surface-card text-slate-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider truncate"
                  style={{ color: isSelected ? meta.color : '#94A3B8' }}
                >
                  {meta.shortLabel}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight font-mono-code text-white">
                {counts[status] ?? 0}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
