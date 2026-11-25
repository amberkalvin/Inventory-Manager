export type VehicleStatus =
  | 'incoming'
  | 'minor_repair'
  | 'major_repair'
  | 'offsite'
  | 'ready';

export type VehicleChecklistKey = 'inspection' | 'detail' | 'video' | 'pictures';

export type VehicleChecklist = Partial<Record<VehicleChecklistKey, boolean>>;

export interface ChecklistItemDef {
  key: VehicleChecklistKey;
  label: string;
}

export const VEHICLE_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: 'inspection', label: 'Inspection' },
  { key: 'detail', label: 'Detail' },
  { key: 'video', label: 'Video' },
  { key: 'pictures', label: 'Pictures' },
];

export interface HistoryChange {
  field: string;
  from?: string;
  to?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string; // ISO timestamp
  userEmail: string;
  userName: string;
  action: string;
  changes?: HistoryChange[];
}

export interface Vehicle {
  id: string;
  stockNumber?: string;
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  color?: string;
  mileage?: number;
  status: VehicleStatus;
  archived?: boolean;
  archivedAt?: string; // ISO timestamp
  location?: string;
  offsiteLocation?: string;
  repairNotes?: string;
  estimatedCost?: number;
  expectedReturnDate?: string; // ISO YYYY-MM-DD
  checklist?: VehicleChecklist;
  photoUrl?: string; // Compressed JPEG data URL or hosted image URL
  history?: HistoryEntry[];
  updatedAt: string; // ISO timestamp
  updatedBy: string;
  createdAt: string; // ISO timestamp
}

export interface StatusMeta {
  key: VehicleStatus;
  label: string;
  shortLabel: string;
  color: string;
  bgTint: string;
  borderTint: string;
  nextStatus: VehicleStatus;
  nextLabel: string;
}

export const ACTIVE_STATUS_ORDER: VehicleStatus[] = [
  'incoming',
  'minor_repair',
  'major_repair',
  'offsite',
];

export const STATUS_ORDER: VehicleStatus[] = [
  'incoming',
  'minor_repair',
  'major_repair',
  'offsite',
  'ready',
];

export function isVehicleArchived(vehicle: Pick<Vehicle, 'status' | 'archived'>): boolean {
  return Boolean(vehicle.archived || vehicle.status === 'ready');
}

export function getVehicleLabel(
  vehicle: Pick<Vehicle, 'stockNumber' | 'year' | 'make' | 'model'>
): string {
  return vehicle.stockNumber?.trim() || `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function normalizeVehicleStatus(raw: unknown): VehicleStatus {
  const val = String(raw ?? '').toLowerCase().trim();
  if (
    val === 'incoming' ||
    val === 'minor_repair' ||
    val === 'major_repair' ||
    val === 'offsite' ||
    val === 'ready'
  ) {
    return val;
  }
  // Gracefully map any legacy "sold" records into archived Frontline Ready
  if (val === 'sold') return 'ready';
  return 'incoming';
}

export const STATUS_META: Record<VehicleStatus, StatusMeta> = {
  incoming: {
    key: 'incoming',
    label: 'Incoming',
    shortLabel: 'Incoming',
    color: '#38BDF8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    borderTint: 'rgba(56, 189, 248, 0.30)',
    nextStatus: 'minor_repair',
    nextLabel: 'To Minor Repair',
  },
  minor_repair: {
    key: 'minor_repair',
    label: 'Minor Repairs',
    shortLabel: 'Minor',
    color: '#FBBF24',
    bgTint: 'rgba(251, 191, 36, 0.14)',
    borderTint: 'rgba(251, 191, 36, 0.30)',
    nextStatus: 'ready',
    nextLabel: 'Frontline Ready',
  },
  major_repair: {
    key: 'major_repair',
    label: 'Major Repairs',
    shortLabel: 'Major',
    color: '#F87171',
    bgTint: 'rgba(248, 113, 113, 0.14)',
    borderTint: 'rgba(248, 113, 113, 0.30)',
    nextStatus: 'minor_repair',
    nextLabel: 'To Minor Repair',
  },
  offsite: {
    key: 'offsite',
    label: 'Offsite',
    shortLabel: 'Offsite',
    color: '#FB923C',
    bgTint: 'rgba(251, 146, 60, 0.14)',
    borderTint: 'rgba(251, 146, 60, 0.30)',
    nextStatus: 'ready',
    nextLabel: 'Frontline Ready',
  },
  ready: {
    key: 'ready',
    label: 'Frontline Ready',
    shortLabel: 'Ready',
    color: '#34D399',
    bgTint: 'rgba(52, 211, 153, 0.14)',
    borderTint: 'rgba(52, 211, 153, 0.30)',
    nextStatus: 'incoming',
    nextLabel: 'Restore',
  },
};

export interface TeamUser {
  name: string;
  email: string;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  lastSyncedAt?: string;
  error?: string;
}
