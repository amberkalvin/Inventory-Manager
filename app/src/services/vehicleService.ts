import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { INITIAL_MOCK_HISTORY, INITIAL_MOCK_VEHICLES } from '../data/mockVehicles';
import {
  isVehicleArchived,
  normalizeVehicleStatus,
  STATUS_META,
  VEHICLE_CHECKLIST_ITEMS,
  type HistoryChange,
  type HistoryEntry,
  type TeamUser,
  type Vehicle,
  type VehicleChecklist,
  type VehicleStatus,
} from '../types/vehicle';
import { formatCurrency, formatMileage } from '../utils/format';
import { getFirebaseClients } from './firebase';

const LOCAL_VEHICLES_KEY = 'im_local_vehicles_v1';
const LOCAL_HISTORY_KEY = 'im_local_history_v1';

function normalizeChecklist(raw: unknown): VehicleChecklist | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const cleaned: VehicleChecklist = {};
  let hasAny = false;
  for (const item of VEHICLE_CHECKLIST_ITEMS) {
    if (typeof rec[item.key] === 'boolean') {
      cleaned[item.key] = rec[item.key] as boolean;
      hasAny = true;
    }
  }
  return hasAny ? cleaned : undefined;
}

function normalizeVehicleRecord(raw: Vehicle): Vehicle {
  const status = normalizeVehicleStatus(raw.status);
  const archived = Boolean(raw.archived || status === 'ready');
  return {
    ...raw,
    status,
    archived,
    archivedAt: archived ? (raw.archivedAt ?? raw.updatedAt) : undefined,
    checklist: normalizeChecklist(raw.checklist),
  };
}

function readLocalVehicles(): Vehicle[] {
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(INITIAL_MOCK_VEHICLES));
      return INITIAL_MOCK_VEHICLES.map(normalizeVehicleRecord);
    }
    const parsed = JSON.parse(raw) as Vehicle[];
    return parsed.map(normalizeVehicleRecord);
  } catch {
    return INITIAL_MOCK_VEHICLES.map(normalizeVehicleRecord);
  }
}

function writeLocalVehicles(vehicles: Vehicle[]): void {
  localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(vehicles));
  window.dispatchEvent(new Event('im-local-sync'));
}

function readLocalHistory(): Record<string, HistoryEntry[]> {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(INITIAL_MOCK_HISTORY));
      return INITIAL_MOCK_HISTORY;
    }
    return JSON.parse(raw) as Record<string, HistoryEntry[]>;
  } catch {
    return INITIAL_MOCK_HISTORY;
  }
}

function appendLocalHistory(
  vehicleId: string,
  user: TeamUser,
  action: string,
  changes?: HistoryChange[]
): void {
  const all = readLocalHistory();
  const list = all[vehicleId] ?? [];
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userEmail: user.email,
    userName: user.name,
    action,
    ...(changes && changes.length > 0 ? { changes } : {}),
  };
  all[vehicleId] = [entry, ...list];
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event('im-local-history-sync'));
}

function normalizeTimestamp(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string' && val) return val;
  return new Date().toISOString();
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) cleaned[key] = val;
  }
  return cleaned;
}

function toFirestoreUpdatePayload(obj: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    payload[key] = val === undefined ? deleteField() : val;
  }
  return payload;
}

function normalizeOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return undefined;
}

function formatChangeSummary(changes: HistoryChange[]): string {
  return changes
    .map((c) => {
      if (c.from && c.to) return `${c.field}: ${c.from} → ${c.to}`;
      if (c.to) return `${c.field}: ${c.to}`;
      if (c.from) return `${c.field}: cleared (was ${c.from})`;
      return `Updated ${c.field}`;
    })
    .join(' · ');
}

function buildVehicleChanges(
  previous: Vehicle,
  nextUpdates: Partial<NewVehicleInput> & { archived?: boolean }
): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(nextUpdates, key);

  const pushStringDiff = (
    field: string,
    prevVal: string | undefined,
    nextVal: string | undefined
  ) => {
    const prevNorm = normalizeOptionalString(prevVal);
    const nextNorm = normalizeOptionalString(nextVal);
    if (prevNorm === nextNorm) return;
    changes.push({
      field,
      from: prevNorm ?? 'Empty',
      to: nextNorm ?? 'Cleared',
    });
  };

  const pushNumberDiff = (
    field: string,
    prevVal: number | undefined,
    nextVal: number | undefined,
    formatter: (n: number) => string
  ) => {
    const prevNorm = normalizeOptionalNumber(prevVal);
    const nextNorm = normalizeOptionalNumber(nextVal);
    if (prevNorm === nextNorm) return;
    changes.push({
      field,
      from: prevNorm !== undefined ? formatter(prevNorm) : 'Empty',
      to: nextNorm !== undefined ? formatter(nextNorm) : 'Cleared',
    });
  };

  if (has('status') && nextUpdates.status && nextUpdates.status !== previous.status) {
    changes.push({
      field: 'Status',
      from: STATUS_META[previous.status].label,
      to: STATUS_META[nextUpdates.status].label,
    });
  }

  const prevArchived = isVehicleArchived(previous);
  const nextStatus = nextUpdates.status ?? previous.status;
  const nextArchived =
    nextUpdates.archived !== undefined
      ? nextUpdates.archived
      : nextStatus === 'ready';
  if (prevArchived !== nextArchived) {
    changes.push({
      field: 'Archive',
      from: prevArchived ? 'Archived' : 'Active Lot',
      to: nextArchived ? 'Archived (Frontline Ready)' : 'Restored to Active Lot',
    });
  }

  if (has('stockNumber')) {
    pushStringDiff('Stock #', previous.stockNumber, nextUpdates.stockNumber);
  }
  if (has('vin')) {
    pushStringDiff('VIN', previous.vin, nextUpdates.vin);
  }
  if (has('year')) {
    pushNumberDiff('Year', previous.year, nextUpdates.year, String);
  }
  if (has('make')) {
    pushStringDiff('Make', previous.make, nextUpdates.make);
  }
  if (has('model')) {
    pushStringDiff('Model', previous.model, nextUpdates.model);
  }
  if (has('trim')) {
    pushStringDiff('Trim', previous.trim, nextUpdates.trim);
  }
  if (has('color')) {
    pushStringDiff('Color', previous.color, nextUpdates.color);
  }
  if (has('mileage')) {
    pushNumberDiff('Mileage', previous.mileage, nextUpdates.mileage, formatMileage);
  }
  if (has('location')) {
    pushStringDiff('Location', previous.location, nextUpdates.location);
  }
  if (has('assignedTo')) {
    pushStringDiff('Assigned To', previous.assignedTo, nextUpdates.assignedTo);
  }
  if (has('estimatedCost')) {
    pushNumberDiff('Est. Cost', previous.estimatedCost, nextUpdates.estimatedCost, formatCurrency);
  }
  if (has('expectedReturnDate')) {
    pushStringDiff('ETA', previous.expectedReturnDate, nextUpdates.expectedReturnDate);
  }
  if (has('repairNotes')) {
    pushStringDiff('Repair Notes', previous.repairNotes, nextUpdates.repairNotes);
  }
  if (has('checklist')) {
    const prevChecklist = previous.checklist ?? {};
    const nextChecklist = nextUpdates.checklist ?? {};
    for (const item of VEHICLE_CHECKLIST_ITEMS) {
      const prevChecked = Boolean(prevChecklist[item.key]);
      const nextChecked = Boolean(nextChecklist[item.key]);
      if (prevChecked !== nextChecked) {
        changes.push({
          field: `Checklist · ${item.label}`,
          from: prevChecked ? 'Checked' : 'Unchecked',
          to: nextChecked ? 'Checked' : 'Unchecked',
        });
      }
    }
  }
  if (has('photoUrl')) {
    const prevPhoto = normalizeOptionalString(previous.photoUrl);
    const nextPhoto = normalizeOptionalString(nextUpdates.photoUrl);
    if (prevPhoto !== nextPhoto) {
      if (!prevPhoto && nextPhoto) {
        changes.push({ field: 'Photo', from: 'None', to: 'Added photo' });
      } else if (prevPhoto && !nextPhoto) {
        changes.push({ field: 'Photo', from: 'Photo', to: 'Removed' });
      } else {
        changes.push({ field: 'Photo', from: 'Previous photo', to: 'Replaced photo' });
      }
    }
  }

  return changes;
}

function parseHistoryChanges(raw: unknown): HistoryChange[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: HistoryChange[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'field' in item) {
      const rec = item as Record<string, unknown>;
      parsed.push({
        field: String(rec.field),
        from: rec.from !== undefined ? String(rec.from) : undefined,
        to: rec.to !== undefined ? String(rec.to) : undefined,
      });
    }
  }
  return parsed.length > 0 ? parsed : undefined;
}

export function subscribeVehicles(
  mode: 'firebase' | 'local',
  onData: (vehicles: Vehicle[]) => void,
  onError: (message: string) => void
): () => void {
  if (mode === 'local') {
    const emit = () => {
      const sorted = [...readLocalVehicles()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
      onData(sorted);
    };
    emit();
    window.addEventListener('im-local-sync', emit);
    window.addEventListener('storage', emit);
    return () => {
      window.removeEventListener('im-local-sync', emit);
      window.removeEventListener('storage', emit);
    };
  }

  const clients = getFirebaseClients();
  if (!clients) {
    onError('Firebase client is not initialized.');
    return () => {};
  }

  const q = query(collection(clients.db, 'vehicles'), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: Vehicle[] = snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        const status = normalizeVehicleStatus(data.status);
        const archived = Boolean(data.archived || status === 'ready');
        const updatedAt = normalizeTimestamp(data.updatedAt);
        return {
          id: d.id,
          stockNumber: String(data.stockNumber ?? ''),
          vin: data.vin ? String(data.vin) : undefined,
          year: Number(data.year ?? new Date().getFullYear()),
          make: String(data.make ?? ''),
          model: String(data.model ?? ''),
          trim: data.trim ? String(data.trim) : undefined,
          color: data.color ? String(data.color) : undefined,
          mileage: typeof data.mileage === 'number' ? data.mileage : undefined,
          status,
          archived,
          archivedAt: archived
            ? (data.archivedAt ? normalizeTimestamp(data.archivedAt) : updatedAt)
            : undefined,
          location: data.location ? String(data.location) : undefined,
          repairNotes: data.repairNotes ? String(data.repairNotes) : undefined,
          estimatedCost: typeof data.estimatedCost === 'number' ? data.estimatedCost : undefined,
          expectedReturnDate: data.expectedReturnDate ? String(data.expectedReturnDate) : undefined,
          assignedTo: data.assignedTo ? String(data.assignedTo) : undefined,
          checklist: normalizeChecklist(data.checklist),
          photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
          updatedAt,
          updatedBy: String(data.updatedBy ?? 'Team'),
          createdAt: normalizeTimestamp(data.createdAt),
        };
      });
      onData(list);
    },
    (err) => {
      if (err.code === 'permission-denied') {
        onError(
          'Access denied by Firestore Security Rules. Ask your admin to add your email to the team allowlist.'
        );
      } else {
        onError(err.message || 'Unable to sync with Firestore.');
      }
    }
  );
}

export function subscribeVehicleHistory(
  mode: 'firebase' | 'local',
  vehicleId: string,
  onData: (entries: HistoryEntry[]) => void,
  onError?: (message: string) => void
): () => void {
  if (mode === 'local') {
    const emit = () => {
      const all = readLocalHistory();
      onData(all[vehicleId] ?? []);
    };
    emit();
    window.addEventListener('im-local-history-sync', emit);
    return () => window.removeEventListener('im-local-history-sync', emit);
  }

  const clients = getFirebaseClients();
  if (!clients) {
    onData([]);
    return () => {};
  }

  const historyCol = collection(clients.db, 'vehicles', vehicleId, 'history');
  return onSnapshot(
    historyCol,
    (snap) => {
      onError?.('');
      const entries: HistoryEntry[] = snap.docs
        .map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            timestamp: normalizeTimestamp(data.timestamp ?? data.clientTimestamp),
            userEmail: String(data.userEmail ?? ''),
            userName: String(data.userName ?? 'Team'),
            action: String(data.action ?? ''),
            changes: parseHistoryChanges(data.changes),
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      onData(entries);
    },
    (err) => {
      if (err.code === 'permission-denied') {
        onError?.(
          'Firestore denied access to vehicle history. Verify your Firestore Security Rules allow read/create on /vehicles/{vehicleId}/history/{entryId}.'
        );
      } else {
        onError?.(err.message || 'Unable to load vehicle history.');
      }
      onData([]);
    }
  );
}

export type NewVehicleInput = Omit<
  Vehicle,
  'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'archived' | 'archivedAt'
>;

export async function createVehicle(
  user: TeamUser,
  input: NewVehicleInput
): Promise<string> {
  const nowIso = new Date().toISOString();
  const status: VehicleStatus = normalizeVehicleStatus(input.status);
  const archived = status === 'ready';
  const action = archived
    ? `Added ${input.year} ${input.make} ${input.model} (${input.stockNumber}) as Frontline Ready (Archived)`
    : `Added ${input.year} ${input.make} ${input.model} (${input.stockNumber}) as ${STATUS_META[status].label}`;

  const initialChanges: HistoryChange[] = [
    { field: 'Status', to: STATUS_META[status].label },
  ];
  if (archived) {
    initialChanges.push({ field: 'Archive', to: 'Archived (Frontline Ready)' });
  }
  if (input.location) initialChanges.push({ field: 'Location', to: input.location });
  if (input.assignedTo) initialChanges.push({ field: 'Assigned To', to: input.assignedTo });
  if (input.mileage !== undefined) {
    initialChanges.push({ field: 'Mileage', to: formatMileage(input.mileage) });
  }
  if (input.estimatedCost !== undefined) {
    initialChanges.push({ field: 'Est. Cost', to: formatCurrency(input.estimatedCost) });
  }
  if (input.repairNotes) initialChanges.push({ field: 'Repair Notes', to: input.repairNotes });

  if (user.mode === 'local') {
    const id = `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next: Vehicle = {
      ...input,
      status,
      archived,
      archivedAt: archived ? nowIso : undefined,
      id,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: user.name,
    };
    writeLocalVehicles([next, ...readLocalVehicles()]);
    appendLocalHistory(id, user, action, initialChanges);
    return id;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');
  const vehicleRef = doc(collection(clients.db, 'vehicles'));
  const historyRef = doc(collection(clients.db, 'vehicles', vehicleRef.id, 'history'));
  const batch = writeBatch(clients.db);
  batch.set(vehicleRef, {
    ...stripUndefined({
      ...(input as unknown as Record<string, unknown>),
      status,
      archived,
      ...(archived ? { archivedAt: serverTimestamp() } : {}),
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  batch.set(historyRef, {
    timestamp: serverTimestamp(),
    clientTimestamp: nowIso,
    userEmail: user.email,
    userName: user.name,
    action,
    changes: initialChanges,
  });
  await batch.commit();
  return vehicleRef.id;
}

export async function updateVehicle(
  user: TeamUser,
  previous: Vehicle,
  updates: Partial<NewVehicleInput>
): Promise<boolean> {
  const nextStatus = updates.status ? normalizeVehicleStatus(updates.status) : previous.status;
  const prevArchived = isVehicleArchived(previous);
  const nextArchived = nextStatus === 'ready';
  const nowIso = new Date().toISOString();

  const normalizedUpdates: Partial<NewVehicleInput> & {
    archived?: boolean;
    archivedAt?: string;
  } = {
    ...updates,
    ...(updates.status ? { status: nextStatus } : {}),
  };

  if (prevArchived !== nextArchived || previous.archived !== nextArchived) {
    normalizedUpdates.archived = nextArchived;
    normalizedUpdates.archivedAt = nextArchived ? nowIso : undefined;
  }

  const changes = buildVehicleChanges(previous, normalizedUpdates);
  if (changes.length === 0) {
    return false;
  }

  const summary = formatChangeSummary(changes);

  if (user.mode === 'local') {
    const list = readLocalVehicles().map((v) => {
      if (v.id !== previous.id) return v;
      const merged: Vehicle = {
        ...v,
        ...normalizedUpdates,
        status: nextStatus,
        archived: nextArchived,
        archivedAt: nextArchived ? (v.archivedAt ?? nowIso) : undefined,
        updatedAt: nowIso,
        updatedBy: user.name,
      };
      // Remove keys explicitly cleared to empty string / undefined
      if (merged.photoUrl === '') merged.photoUrl = undefined;
      return merged;
    });
    writeLocalVehicles(list);
    appendLocalHistory(previous.id, user, summary, changes);
    return true;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');
  const vehicleRef = doc(clients.db, 'vehicles', previous.id);
  const historyRef = doc(collection(clients.db, 'vehicles', previous.id, 'history'));

  const firestoreFields: Record<string, unknown> = {
    ...(normalizedUpdates as unknown as Record<string, unknown>),
  };
  if (firestoreFields.photoUrl === '') {
    firestoreFields.photoUrl = undefined;
  }
  if (nextArchived && !prevArchived) {
    firestoreFields.archivedAt = serverTimestamp();
  }

  const batch = writeBatch(clients.db);
  batch.update(vehicleRef, {
    ...toFirestoreUpdatePayload(firestoreFields),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  batch.set(historyRef, {
    timestamp: serverTimestamp(),
    clientTimestamp: nowIso,
    userEmail: user.email,
    userName: user.name,
    action: summary,
    changes,
  });
  await batch.commit();
  return true;
}

export async function deleteVehicle(user: TeamUser, vehicleId: string): Promise<void> {
  if (user.mode === 'local') {
    const next = readLocalVehicles().filter((v) => v.id !== vehicleId);
    writeLocalVehicles(next);
    return;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');
  await deleteDoc(doc(clients.db, 'vehicles', vehicleId));
}

export async function bulkImportVehicles(
  user: TeamUser,
  items: NewVehicleInput[]
): Promise<number> {
  if (items.length === 0) return 0;

  if (user.mode === 'local') {
    const nowIso = new Date().toISOString();
    const created: Vehicle[] = items.map((item, idx) => {
      const status = normalizeVehicleStatus(item.status);
      const archived = status === 'ready';
      return {
        ...item,
        status,
        archived,
        archivedAt: archived ? nowIso : undefined,
        id: `veh-${Date.now()}-${idx}`,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: user.name,
      };
    });
    writeLocalVehicles([...created, ...readLocalVehicles()]);
    created.forEach((v) =>
      appendLocalHistory(
        v.id,
        user,
        v.archived
          ? `Imported ${v.stockNumber} via CSV (Archived as Frontline Ready)`
          : `Imported ${v.stockNumber} via CSV`,
        [
          { field: 'Status', to: STATUS_META[v.status].label },
          ...(v.archived ? [{ field: 'Archive', to: 'Archived (Frontline Ready)' }] : []),
        ]
      )
    );
    return created.length;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');

  const batch = writeBatch(clients.db);
  for (const item of items) {
    const status = normalizeVehicleStatus(item.status);
    const archived = status === 'ready';
    const ref = doc(collection(clients.db, 'vehicles'));
    batch.set(ref, {
      ...stripUndefined({
        ...(item as unknown as Record<string, unknown>),
        status,
        archived,
        ...(archived ? { archivedAt: serverTimestamp() } : {}),
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.name,
    });
  }
  await batch.commit();
  return items.length;
}

export function resetLocalDemoData(): void {
  localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(INITIAL_MOCK_VEHICLES));
  localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(INITIAL_MOCK_HISTORY));
  window.dispatchEvent(new Event('im-local-sync'));
  window.dispatchEvent(new Event('im-local-history-sync'));
}
