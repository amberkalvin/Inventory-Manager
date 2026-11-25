import {
  isVehicleArchived,
  STATUS_ORDER,
  VEHICLE_CHECKLIST_ITEMS,
  type Vehicle,
  type VehicleChecklist,
  type VehicleStatus,
} from '../types/vehicle';
import type { NewVehicleInput } from './vehicleService';
import { exportTextFile } from './nativeBridge';

const CSV_HEADERS = [
  'Stock #',
  'VIN',
  'Year',
  'Make',
  'Model',
  'Trim',
  'Color',
  'Mileage',
  'Status',
  'Archived',
  'Archived At',
  'Checklist',
  'Offsite Location',
  'Repair Notes',
  'Estimated Cost',
  'Date Sent',
  'Updated By',
  'Updated At',
];

function escapeCsvCell(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportVehiclesToCsv(vehicles: Vehicle[]): void {
  const rows = [
    CSV_HEADERS.join(','),
    ...vehicles.map((v) =>
      [
        v.stockNumber ?? '',
        v.vin ?? '',
        v.year,
        v.make,
        v.model,
        v.trim ?? '',
        v.color ?? '',
        v.mileage ?? '',
        v.status,
        isVehicleArchived(v) ? 'Yes' : 'No',
        v.archivedAt ?? '',
        VEHICLE_CHECKLIST_ITEMS.filter((item) => Boolean(v.checklist?.[item.key]))
          .map((item) => item.label)
          .join('; '),
        v.offsiteLocation ?? '',
        v.repairNotes ?? '',
        v.estimatedCost ?? '',
        v.expectedReturnDate ?? '',
        v.updatedBy,
        v.updatedAt,
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  exportTextFile(`inventory-export-${stamp}.csv`, rows.join('\n'), 'text/csv');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function normalizeStatus(raw: string | undefined): VehicleStatus {
  const val = (raw ?? '').toLowerCase().trim();
  if (STATUS_ORDER.includes(val as VehicleStatus)) return val as VehicleStatus;
  if (val.includes('major')) return 'major_repair';
  if (val.includes('minor') || val.includes('repair') || val.includes('recon')) return 'minor_repair';
  if (val.includes('off') || val.includes('body') || val.includes('shop')) return 'offsite';
  if (val.includes('ready') || val.includes('front') || val.includes('archiv')) return 'ready';
  return 'incoming';
}

export function parseCsvVehicles(csvText: string): NewVehicleInput[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = (...candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const iStock = col('stock', 'stk', 'unit');
  const iVin = col('vin');
  const iYear = col('year', 'yr');
  const iMake = col('make');
  const iModel = col('model');
  const iTrim = col('trim', 'series');
  const iColor = col('color', 'extcolor');
  const iMiles = col('mileage', 'miles', 'odo');
  const iStatus = col('status', 'stage', 'tab');
  const iOffsite = col('offsitelocation', 'offsite', 'shop', 'contact');
  const iNotes = col('repairnotes', 'needs', 'notes', 'comment', 'issue');
  const iCost = col('estimatedcost', 'cost', 'est');
  const iEta = col('datesent', 'sent', 'expectedreturndate', 'eta', 'return');
  const iChecklist = col('checklist', 'prep');

  const out: NewVehicleInput[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');
    const make = get(iMake);
    const model = get(iModel);
    const stock = get(iStock) || undefined;
    if (!make && !model && !get(iVin)) continue;

    const yearNum = Number(get(iYear));
    const milesNum = Number(get(iMiles).replace(/[^0-9.]/g, ''));
    const costNum = Number(get(iCost).replace(/[^0-9.]/g, ''));
    const rawChecklist = get(iChecklist).toLowerCase();
    let checklist: VehicleChecklist | undefined;
    if (rawChecklist) {
      const parsedChecklist: VehicleChecklist = {};
      for (const item of VEHICLE_CHECKLIST_ITEMS) {
        if (rawChecklist.includes(item.key) || rawChecklist.includes(item.label.toLowerCase())) {
          parsedChecklist[item.key] = true;
        }
      }
      if (Object.keys(parsedChecklist).length > 0) checklist = parsedChecklist;
    }

    out.push({
      stockNumber: stock,
      vin: get(iVin) || undefined,
      year: Number.isFinite(yearNum) && yearNum > 1950 ? yearNum : new Date().getFullYear(),
      make: make || 'Unknown',
      model: model || 'Vehicle',
      trim: get(iTrim) || undefined,
      color: get(iColor) || undefined,
      mileage: Number.isFinite(milesNum) && milesNum > 0 ? Math.round(milesNum) : undefined,
      status: normalizeStatus(get(iStatus)),
      offsiteLocation: get(iOffsite) || undefined,
      repairNotes: get(iNotes) || undefined,
      estimatedCost: Number.isFinite(costNum) && costNum > 0 ? Math.round(costNum) : undefined,
      expectedReturnDate: get(iEta) || undefined,
      checklist,
    });
  }

  return out;
}
