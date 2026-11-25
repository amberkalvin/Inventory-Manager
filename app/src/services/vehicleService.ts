import {
  getVehicleLabel,
  isVehicleArchived,
  normalizeVehicleStatus,
  STATUS_META,
  VEHICLE_CHECKLIST_ITEMS,
  type HistoryChange,
  type HistoryEntry,
  type SyncState,
  type TeamUser,
  type Vehicle,
  type VehicleChecklist,
  type VehicleStatus,
} from '../types/vehicle';
import { formatCurrency, formatMileage } from '../utils/format';

export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzWdvujNAKBaNUieZAX--78huRsU-hlGf5D7dl9C9VgSaLzVGgrim9nQULt4xdNHbkS/exec';

export const SYNC_POLL_INTERVAL_MS = 10_000;

const LOCAL_VEHICLES_KEY = 'im_cached_vehicles_v2';
const LOCAL_HISTORY_KEY = 'im_cached_history_v2';

let mutationVersion = 0;
let pendingWrites = 0;
let currentSyncState: SyncState = { status: 'idle' };

const syncListeners = new Set<(state: SyncState) => void>();

function emitSyncState(next: SyncState): void {
  currentSyncState = next;
  syncListeners.forEach((fn) => fn(next));
}

export function subscribeSyncState(onState: (state: SyncState) => void): () => void {
  syncListeners.add(onState);
  onState(currentSyncState);
  return () => {
    syncListeners.delete(onState);
  };
}

function parseMaybeJson<T>(raw: unknown): T | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  return raw as T;
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  return Boolean(val);
}

function parseOptionalNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const cleaned = Number(val.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(cleaned)) return cleaned;
  }
  return undefined;
}

function normalizeOptionalString(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeChecklist(raw: unknown): VehicleChecklist | undefined {
  const obj = parseMaybeJson<Record<string, unknown>>(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const cleaned: VehicleChecklist = {};
  let hasAny = false;
  for (const item of VEHICLE_CHECKLIST_ITEMS) {
    if (item.key in obj && obj[item.key] !== undefined && obj[item.key] !== '') {
      cleaned[item.key] = parseBoolean(obj[item.key]);
      hasAny = true;
    }
  }
  return hasAny ? cleaned : undefined;
}

function parseHistoryChanges(raw: unknown): HistoryChange[] | undefined {
  const arr = parseMaybeJson<unknown[]>(raw);
  if (!Array.isArray(arr)) return undefined;
  const parsed: HistoryChange[] = [];
  for (const item of arr) {
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

function normalizeHistoryEntries(raw: unknown): HistoryEntry[] | undefined {
  const arr = parseMaybeJson<unknown[]>(raw);
  if (!Array.isArray(arr)) return undefined;
  const entries: HistoryEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    entries.push({
      id: normalizeOptionalString(rec.id) ?? `h-${Date.now()}-${i}`,
      timestamp: normalizeTimestamp(rec.timestamp),
      userEmail: normalizeOptionalString(rec.userEmail) ?? '',
      userName: normalizeOptionalString(rec.userName) ?? 'Team',
      action: normalizeOptionalString(rec.action) ?? '',
      changes: parseHistoryChanges(rec.changes),
    });
  }
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function normalizeTimestamp(val: unknown): string {
  if (typeof val === 'string' && val.trim()) {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return val;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return new Date(val).toISOString();
  }
  return new Date().toISOString();
}

function normalizeVehicleRecord(raw: Record<string, unknown>, fallbackIndex = 0): Vehicle {
  const status = normalizeVehicleStatus(raw.status);
  const archived =
    raw.archived !== undefined && raw.archived !== ''
      ? parseBoolean(raw.archived) || status === 'ready'
      : status === 'ready';
  const nowIso = new Date().toISOString();
  const updatedAt = raw.updatedAt ? normalizeTimestamp(raw.updatedAt) : nowIso;
  const createdAt = raw.createdAt ? normalizeTimestamp(raw.createdAt) : updatedAt;
  const yearNum = parseOptionalNumber(raw.year);

  return {
    id: normalizeOptionalString(raw.id) ?? `veh-sync-${fallbackIndex}-${Date.now()}`,
    stockNumber: normalizeOptionalString(raw.stockNumber),
    vin: normalizeOptionalString(raw.vin),
    year: yearNum && yearNum > 1900 ? Math.round(yearNum) : new Date().getFullYear(),
    make: normalizeOptionalString(raw.make) ?? '',
    model: normalizeOptionalString(raw.model) ?? '',
    trim: normalizeOptionalString(raw.trim),
    color: normalizeOptionalString(raw.color),
    mileage: parseOptionalNumber(raw.mileage),
    status,
    archived,
    archivedAt: archived
      ? raw.archivedAt
        ? normalizeTimestamp(raw.archivedAt)
        : updatedAt
      : undefined,
    location: normalizeOptionalString(raw.location),
    repairNotes: normalizeOptionalString(raw.repairNotes),
    estimatedCost: parseOptionalNumber(raw.estimatedCost),
    expectedReturnDate: normalizeOptionalString(raw.expectedReturnDate),
    assignedTo: normalizeOptionalString(raw.assignedTo),
    checklist: normalizeChecklist(raw.checklist),
    photoUrl: normalizeOptionalString(raw.photoUrl),
    history: normalizeHistoryEntries(raw.history),
    updatedAt,
    updatedBy: normalizeOptionalString(raw.updatedBy) ?? 'Team',
    createdAt,
  };
}

function readCachedVehicles(): Vehicle[] {
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, idx) => normalizeVehicleRecord(item, idx));
  } catch {
    return [];
  }
}

function writeCachedVehicles(vehicles: Vehicle[]): void {
  try {
    localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(vehicles));
  } catch {
    // Ignore storage quota issues so sync still proceeds
  }
  window.dispatchEvent(new Event('im-vehicles-sync'));
}

function readCachedHistory(): Record<string, HistoryEntry[]> {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, HistoryEntry[]>;
  } catch {
    return {};
  }
}

function writeCachedHistory(historyMap: Record<string, HistoryEntry[]>): void {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(historyMap));
  } catch {
    // Ignore storage quota issues
  }
  window.dispatchEvent(new Event('im-history-sync'));
}

function getVehicleHistoryList(vehicleId: string): HistoryEntry[] {
  const fromVehicles = readCachedVehicles().find((v) => v.id === vehicleId)?.history;
  const fromMap = readCachedHistory()[vehicleId];
  const merged = new Map<string, HistoryEntry>();
  for (const entry of fromMap ?? []) merged.set(entry.id, entry);
  for (const entry of fromVehicles ?? []) merged.set(entry.id, entry);
  return Array.from(merged.values()).sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
}

function extractReadableError(rawText: string, status: number): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    const match = trimmed.match(
      /<div[^>]*font-family:\s*monospace[^>]*>([\s\S]*?)<\/div>/i
    );
    if (match?.[1]) {
      const decoded = match[1]
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, '')
        .trim();
      return `Google Apps Script error: ${decoded}`;
    }
    return `Google Apps Script returned an HTML error page (HTTP ${status}). Check your Apps Script deployment and sheet name.`;
  }
  if (trimmed) return `Sync error (HTTP ${status}): ${trimmed.slice(0, 180)}`;
  return `Sync error (HTTP ${status}).`;
}

function parseRemoteVehicleArray(rawText: string, status: number): Vehicle[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(extractReadableError(trimmed, status));
  }

  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.error === 'string' && rec.error) {
      throw new Error(`Google Apps Script error: ${rec.error}`);
    }
    if (Array.isArray(rec.vehicles)) {
      items = rec.vehicles;
    } else if (Array.isArray(rec.data)) {
      items = rec.data;
    } else {
      throw new Error('Unexpected JSON response from Google Apps Script (expected an array).');
    }
  } else {
    throw new Error('Unexpected response format from Google Apps Script.');
  }

  return items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => normalizeVehicleRecord(item, idx));
}

export async function fetchVehiclesFromRemote(): Promise<Vehicle[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitSyncState({
      status: 'offline',
      lastSyncedAt: currentSyncState.lastSyncedAt,
    });
    return null;
  }

  const pollVersion = mutationVersion;
  if (pendingWrites > 0) return null;

  emitSyncState({
    status: 'syncing',
    lastSyncedAt: currentSyncState.lastSyncedAt,
  });

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'GET',
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(extractReadableError(text, res.status));
    }
    const remoteVehicles = parseRemoteVehicleArray(text, res.status);

    // Avoid overwriting local optimistic state if a write happened during this poll
    if (pendingWrites > 0 || pollVersion !== mutationVersion) {
      return null;
    }

    const existingHistory = readCachedHistory();
    const mergedHistory: Record<string, HistoryEntry[]> = { ...existingHistory };
    const hydrated = remoteVehicles.map((v) => {
      const localEntries = existingHistory[v.id] ?? [];
      const remoteEntries = v.history ?? [];
      if (remoteEntries.length > 0) {
        const byId = new Map<string, HistoryEntry>();
        for (const e of localEntries) byId.set(e.id, e);
        for (const e of remoteEntries) byId.set(e.id, e);
        const combined = Array.from(byId.values()).sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp)
        );
        mergedHistory[v.id] = combined;
        return { ...v, history: combined };
      }
      if (localEntries.length > 0) {
        return { ...v, history: localEntries };
      }
      return v;
    });

    writeCachedHistory(mergedHistory);
    writeCachedVehicles(hydrated);
    emitSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
    });
    return hydrated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to sync with Google Sheets.';
    emitSyncState({
      status: 'error',
      lastSyncedAt: currentSyncState.lastSyncedAt,
      error: msg,
    });
    return null;
  }
}

async function postVehiclesToRemote(vehicles: Vehicle[]): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitSyncState({
      status: 'offline',
      lastSyncedAt: currentSyncState.lastSyncedAt,
      error: 'Saved locally while offline. Changes will sync when reconnected.',
    });
    return;
  }

  pendingWrites++;
  emitSyncState({
    status: 'syncing',
    lastSyncedAt: currentSyncState.lastSyncedAt,
  });

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(vehicles),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(extractReadableError(text, res.status));
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new Error(extractReadableError(trimmed, res.status));
    }
    emitSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Unable to save updates to Google Sheets.';
    emitSyncState({
      status: 'error',
      lastSyncedAt: currentSyncState.lastSyncedAt,
      error: msg,
    });
    throw new Error(msg);
  } finally {
    pendingWrites = Math.max(0, pendingWrites - 1);
  }
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
    const prevNorm = parseOptionalNumber(prevVal);
    const nextNorm = parseOptionalNumber(nextVal);
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
    nextUpdates.archived !== undefined ? nextUpdates.archived : nextStatus === 'ready';
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

export function subscribeVehicles(onData: (vehicles: Vehicle[]) => void): () => void {
  const emitCached = () => {
    const sorted = [...readCachedVehicles()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    onData(sorted);
  };

  emitCached();
  void fetchVehiclesFromRemote();

  const timer = window.setInterval(() => {
    void fetchVehiclesFromRemote();
  }, SYNC_POLL_INTERVAL_MS);

  const onOnline = () => {
    void fetchVehiclesFromRemote();
  };

  window.addEventListener('im-vehicles-sync', emitCached);
  window.addEventListener('storage', emitCached);
  window.addEventListener('online', onOnline);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('im-vehicles-sync', emitCached);
    window.removeEventListener('storage', emitCached);
    window.removeEventListener('online', onOnline);
  };
}

export function subscribeVehicleHistory(
  vehicleId: string,
  onData: (entries: HistoryEntry[]) => void
): () => void {
  const emit = () => {
    onData(getVehicleHistoryList(vehicleId));
  };
  emit();
  window.addEventListener('im-history-sync', emit);
  window.addEventListener('im-vehicles-sync', emit);
  return () => {
    window.removeEventListener('im-history-sync', emit);
    window.removeEventListener('im-vehicles-sync', emit);
  };
}

export type NewVehicleInput = Omit<
  Vehicle,
  'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'archived' | 'archivedAt' | 'history'
>;

export async function createVehicle(
  user: TeamUser,
  input: NewVehicleInput
): Promise<string> {
  const nowIso = new Date().toISOString();
  const status: VehicleStatus = normalizeVehicleStatus(input.status);
  const archived = status === 'ready';
  const stockSuffix = input.stockNumber ? ` (${input.stockNumber})` : '';
  const action = archived
    ? `Added ${input.year} ${input.make} ${input.model}${stockSuffix} as Frontline Ready (Archived)`
    : `Added ${input.year} ${input.make} ${input.model}${stockSuffix} as ${STATUS_META[status].label}`;

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

  const id = `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const initialEntry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: nowIso,
    userEmail: user.email,
    userName: user.name,
    action,
    changes: initialChanges,
  };

  const nextVehicle: Vehicle = {
    ...input,
    status,
    archived,
    archivedAt: archived ? nowIso : undefined,
    id,
    history: [initialEntry],
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: user.name,
  };

  mutationVersion++;
  const nextList = [nextVehicle, ...readCachedVehicles()];
  const historyMap = readCachedHistory();
  historyMap[id] = [initialEntry];
  writeCachedHistory(historyMap);
  writeCachedVehicles(nextList);

  await postVehiclesToRemote(nextList);
  return id;
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
  const nextEntry: HistoryEntry = {
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: nowIso,
    userEmail: user.email,
    userName: user.name,
    action: summary,
    changes,
  };

  const updatedHistory = [nextEntry, ...getVehicleHistoryList(previous.id)];

  mutationVersion++;
  const nextList = readCachedVehicles().map((v) => {
    if (v.id !== previous.id) return v;
    const merged: Vehicle = {
      ...v,
      ...normalizedUpdates,
      status: nextStatus,
      archived: nextArchived,
      archivedAt: nextArchived ? (v.archivedAt ?? nowIso) : undefined,
      history: updatedHistory,
      updatedAt: nowIso,
      updatedBy: user.name,
    };
    if (merged.photoUrl === '') merged.photoUrl = undefined;
    return merged;
  });

  const historyMap = readCachedHistory();
  historyMap[previous.id] = updatedHistory;
  writeCachedHistory(historyMap);
  writeCachedVehicles(nextList);

  await postVehiclesToRemote(nextList);
  return true;
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  mutationVersion++;
  const nextList = readCachedVehicles().filter((v) => v.id !== vehicleId);
  writeCachedVehicles(nextList);
  await postVehiclesToRemote(nextList);
}

export async function bulkImportVehicles(
  user: TeamUser,
  items: NewVehicleInput[]
): Promise<number> {
  if (items.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const historyMap = readCachedHistory();

  const created: Vehicle[] = items.map((item, idx) => {
    const status = normalizeVehicleStatus(item.status);
    const archived = status === 'ready';
    const id = `veh-${Date.now()}-${idx}`;
    const label = getVehicleLabel(item);
    const entry: HistoryEntry = {
      id: `h-${Date.now()}-${idx}`,
      timestamp: nowIso,
      userEmail: user.email,
      userName: user.name,
      action: archived
        ? `Imported ${label} via CSV (Archived as Frontline Ready)`
        : `Imported ${label} via CSV`,
      changes: [
        { field: 'Status', to: STATUS_META[status].label },
        ...(archived ? [{ field: 'Archive', to: 'Archived (Frontline Ready)' }] : []),
      ],
    };
    historyMap[id] = [entry];
    return {
      ...item,
      status,
      archived,
      archivedAt: archived ? nowIso : undefined,
      id,
      history: [entry],
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: user.name,
    };
  });

  mutationVersion++;
  const nextList = [...created, ...readCachedVehicles()];
  writeCachedHistory(historyMap);
  writeCachedVehicles(nextList);

  await postVehiclesToRemote(nextList);
  return created.length;
}
