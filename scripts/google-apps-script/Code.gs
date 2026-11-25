/**
 * Inventory Manager — Google Sheets + Google Drive Sync Backend
 *
 * Stores all vehicle fields (including checklist & change history) in the first
 * tab of your Google Sheet, and automatically saves uploaded vehicle photos to
 * a "Inventory Manager Photos" folder in Google Drive so photos sync fast
 * across all phones without hitting Google Sheets' 50,000-character cell limit.
 *
 * Setup:
 * 1. Open your Google Sheet → Extensions → Apps Script.
 * 2. Replace everything in Code.gs with this file and click Save.
 * 3. Click Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy.
 *    (Grant Google Drive permission when prompted on first deploy/test.)
 */

const PHOTO_FOLDER_NAME = 'Inventory Manager Photos';

const COLUMNS = [
  'id',
  'status',
  'archived',
  'archivedAt',
  'stockNumber',
  'vin',
  'year',
  'make',
  'model',
  'trim',
  'color',
  'mileage',
  'location',
  'needs',
  'estimatedCost',
  'dateSent',
  'contact',
  'checklist',
  'photoUrl',
  'history',
  'updatedBy',
  'updatedAt',
  'createdAt',
];

function getInventorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  if (!sheet) {
    throw new Error('No sheet tab found in this spreadsheet.');
  }
  return sheet;
}

function getOrCreatePhotoFolder() {
  const existing = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (existing.hasNext()) {
    return existing.next();
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function saveDataUrlToDrive(dataUrl, vehicleId) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = mimeType.indexOf('png') !== -1 ? 'png' : 'jpg';
  const bytes = Utilities.base64Decode(base64Data);
  const safeId = String(vehicleId || 'vehicle').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = safeId + '-' + Date.now() + '.' + ext;

  const folder = getOrCreatePhotoFolder();
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function parseCellJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (_err) {
      return value;
    }
  }
  return value;
}

function readVehiclesFromSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (h) {
    return String(h || '').trim();
  });

  const vehicles = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const hasData = row.some(function (cell) {
      return cell !== '' && cell !== null && cell !== undefined;
    });
    if (!hasData) continue;

    const item = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      let val = row[c];
      if (val instanceof Date) {
        val = key === 'dateSent'
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd')
          : val.toISOString();
      } else if (key === 'checklist' || key === 'history') {
        val = parseCellJson(val);
      }
      item[key] = val;
    }
    vehicles.push(item);
  }
  return vehicles;
}

function doGet() {
  try {
    const sheet = getInventorySheet();
    const vehicles = readVehiclesFromSheet(sheet);
    return jsonResponse(vehicles);
  } catch (err) {
    return jsonResponse({ error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '[]';
    const parsed = JSON.parse(rawBody);
    const inputList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.vehicles)
        ? parsed.vehicles
        : [];

    const processedVehicles = inputList.map(function (v) {
      const copy = Object.assign({}, v);

      // Upload any newly captured base64 photo to Google Drive and store its URL
      if (typeof copy.photoUrl === 'string' && copy.photoUrl.indexOf('data:image/') === 0) {
        copy.photoUrl = saveDataUrlToDrive(copy.photoUrl, copy.id);
      }

      // Normalize alias fields so Sheet columns stay consistent
      copy.needs = copy.needs !== undefined ? copy.needs : (copy.repairNotes || '');
      copy.dateSent = copy.dateSent !== undefined ? copy.dateSent : (copy.expectedReturnDate || '');
      copy.contact = copy.contact !== undefined ? copy.contact : (copy.assignedTo || '');

      return copy;
    });

    const rows = [COLUMNS];
    for (let i = 0; i < processedVehicles.length; i++) {
      const v = processedVehicles[i];
      const row = COLUMNS.map(function (col) {
        const val = v[col];
        if (val === undefined || val === null) return '';
        if (col === 'checklist') {
          return typeof val === 'string' ? val : JSON.stringify(val);
        }
        if (col === 'history') {
          if (Array.isArray(val)) {
            // Keep history comfortably under Google Sheets' 50,000-character cell limit
            let trimmed = val.slice(0, 100);
            let serialized = JSON.stringify(trimmed);
            while (serialized.length > 45000 && trimmed.length > 1) {
              trimmed = trimmed.slice(0, Math.floor(trimmed.length / 2));
              serialized = JSON.stringify(trimmed);
            }
            return serialized;
          }
          return typeof val === 'string' ? val : '';
        }
        return val;
      });
      rows.push(row);
    }

    const sheet = getInventorySheet();
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, COLUMNS.length).setValues(rows);

    return jsonResponse({ ok: true, vehicles: processedVehicles });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}
