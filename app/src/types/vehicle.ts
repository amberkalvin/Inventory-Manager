export type VehicleStatus =
  | 'incoming'
  | 'minor_repair'
  | 'major_repair'
  | 'offsite'
  | 'ready'
  | 'sold';

export interface Vehicle {
  id: string;
  stockNumber: string;
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  color?: string;
  mileage?: number;
  status: VehicleStatus;
  location?: string;
  repairNotes?: string;
  estimatedCost?: number;
  expectedReturnDate?: string; // ISO YYYY-MM-DD
  assignedTo?: string;
  photoUrl?: string; // Compressed JPEG data URL or hosted image URL
  updatedAt: string; // ISO timestamp
  updatedBy: string;
  createdAt: string; // ISO timestamp
}

export interface HistoryEntry {
  id: string;
  timestamp: string; // ISO timestamp
  userEmail: string;
  userName: string;
  action: string;
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

export const STATUS_ORDER: VehicleStatus[] = [
  'incoming',
  'minor_repair',
  'major_repair',
  'offsite',
  'ready',
  'sold',
];

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
    nextLabel: 'Mark Ready',
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
    nextLabel: 'Back & Ready',
  },
  ready: {
    key: 'ready',
    label: 'Frontline Ready',
    shortLabel: 'Ready',
    color: '#34D399',
    bgTint: 'rgba(52, 211, 153, 0.14)',
    borderTint: 'rgba(52, 211, 153, 0.30)',
    nextStatus: 'sold',
    nextLabel: 'Mark Sold',
  },
  sold: {
    key: 'sold',
    label: 'Sold',
    shortLabel: 'Sold',
    color: '#94A3B8',
    bgTint: 'rgba(148, 163, 184, 0.14)',
    borderTint: 'rgba(148, 163, 184, 0.28)',
    nextStatus: 'incoming',
    nextLabel: 'Re-Open',
  },
};

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface TeamUser {
  name: string;
  email: string;
  mode: 'firebase' | 'local';
}
