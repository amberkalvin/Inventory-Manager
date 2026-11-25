import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { INITIAL_MOCK_HISTORY, INITIAL_MOCK_VEHICLES } from '../data/mockVehicles';
import { STATUS_META, type HistoryEntry, type TeamUser, type Vehicle, type VehicleStatus } from '../types/vehicle';
import { getFirebaseClients } from './firebase';

const LOCAL_VEHICLES_KEY = 'im_local_vehicles_v1';
const LOCAL_HISTORY_KEY = 'im_local_history_v1';

function readLocalVehicles(): Vehicle[] {
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(INITIAL_MOCK_VEHICLES));
      return INITIAL_MOCK_VEHICLES;
    }
    return JSON.parse(raw) as Vehicle[];
  } catch {
    return INITIAL_MOCK_VEHICLES;
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

function appendLocalHistory(vehicleId: string, user: TeamUser, action: string): void {
  const all = readLocalHistory();
  const list = all[vehicleId] ?? [];
  const entry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userEmail: user.email,
    userName: user.name,
    action,
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
        const data = d.data();
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
          status: (data.status as VehicleStatus) ?? 'incoming',
          location: data.location ? String(data.location) : undefined,
          repairNotes: data.repairNotes ? String(data.repairNotes) : undefined,
          estimatedCost: typeof data.estimatedCost === 'number' ? data.estimatedCost : undefined,
          expectedReturnDate: data.expectedReturnDate ? String(data.expectedReturnDate) : undefined,
          assignedTo: data.assignedTo ? String(data.assignedTo) : undefined,
          updatedAt: normalizeTimestamp(data.updatedAt),
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
  onData: (entries: HistoryEntry[]) => void
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

  const q = query(
    collection(clients.db, 'vehicles', vehicleId, 'history'),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries: HistoryEntry[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          timestamp: normalizeTimestamp(data.timestamp),
          userEmail: String(data.userEmail ?? ''),
          userName: String(data.userName ?? 'Team'),
          action: String(data.action ?? ''),
        };
      });
      onData(entries);
    },
    () => onData([])
  );
}

export type NewVehicleInput = Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>;

export async function createVehicle(
  user: TeamUser,
  input: NewVehicleInput
): Promise<string> {
  const nowIso = new Date().toISOString();
  const action = `Added ${input.year} ${input.make} ${input.model} (${input.stockNumber}) as ${STATUS_META[input.status].label}`;

  if (user.mode === 'local') {
    const id = `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next: Vehicle = {
      ...input,
      id,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: user.name,
    };
    writeLocalVehicles([next, ...readLocalVehicles()]);
    appendLocalHistory(id, user, action);
    return id;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');
  const ref = await addDoc(collection(clients.db, 'vehicles'), {
    ...stripUndefined(input as unknown as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  await addDoc(collection(clients.db, 'vehicles', ref.id, 'history'), {
    timestamp: serverTimestamp(),
    userEmail: user.email,
    userName: user.name,
    action,
  });
  return ref.id;
}

export async function updateVehicle(
  user: TeamUser,
  previous: Vehicle,
  updates: Partial<NewVehicleInput>
): Promise<void> {
  const changes: string[] = [];
  if (updates.status && updates.status !== previous.status) {
    changes.push(
      `Moved from ${STATUS_META[previous.status].label} to ${STATUS_META[updates.status].label}`
    );
  }
  if (updates.location !== undefined && updates.location !== previous.location) {
    changes.push(`Location set to ${updates.location || 'Unassigned'}`);
  }
  if (updates.assignedTo !== undefined && updates.assignedTo !== previous.assignedTo) {
    changes.push(`Assigned to ${updates.assignedTo || 'Unassigned'}`);
  }
  if (updates.repairNotes !== undefined && updates.repairNotes !== previous.repairNotes) {
    changes.push('Updated repair notes');
  }
  if (updates.estimatedCost !== undefined && updates.estimatedCost !== previous.estimatedCost) {
    changes.push(
      updates.estimatedCost ? `Estimated cost set to $${updates.estimatedCost}` : 'Cleared cost estimate'
    );
  }
  const summary = changes.length > 0 ? changes.join(' · ') : 'Updated vehicle details';

  if (user.mode === 'local') {
    const list = readLocalVehicles().map((v) =>
      v.id === previous.id
        ? {
            ...v,
            ...updates,
            updatedAt: new Date().toISOString(),
            updatedBy: user.name,
          }
        : v
    );
    writeLocalVehicles(list);
    appendLocalHistory(previous.id, user, summary);
    return;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');
  const vehicleRef = doc(clients.db, 'vehicles', previous.id);
  await updateDoc(vehicleRef, {
    ...stripUndefined(updates as unknown as Record<string, unknown>),
    updatedAt: serverTimestamp(),
    updatedBy: user.name,
  });
  await addDoc(collection(clients.db, 'vehicles', previous.id, 'history'), {
    timestamp: serverTimestamp(),
    userEmail: user.email,
    userName: user.name,
    action: summary,
  });
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
    const created: Vehicle[] = items.map((item, idx) => ({
      ...item,
      id: `veh-${Date.now()}-${idx}`,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: user.name,
    }));
    writeLocalVehicles([...created, ...readLocalVehicles()]);
    created.forEach((v) =>
      appendLocalHistory(v.id, user, `Imported ${v.stockNumber} via CSV`)
    );
    return created.length;
  }

  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase not connected');

  const batch = writeBatch(clients.db);
  for (const item of items) {
    const ref = doc(collection(clients.db, 'vehicles'));
    batch.set(ref, {
      ...stripUndefined(item as unknown as Record<string, unknown>),
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
