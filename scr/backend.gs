/**
 * Google Apps Script backend for OEE web app.
 *
 * Required sheets:
 * 1) records (for production/OEE logs)
 * 2) products_master (or fallback to first sheet with headers product_name,machine)
 */

const RECORD_SHEET_NAME = 'records';
const MASTER_SHEET_NAME = 'products_master';

const RECORD_HEADERS = [
  'date',
  'shift',
  'line',
  'machine',
  'productName',
  'productionQty',
  'totalCount',
  'plannedMinutes',
  'downtimeMinutes',
  'goodCount',
  'idealCycleTime',
  'notes',
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'list') {
    return jsonOutput_({ records: listRecords_() });
  }

  if (action === 'options') {
    return jsonOutput_(getDropdownOptions_());
  }

  return jsonOutput_({ error: 'Unknown action. Use ?action=list or ?action=options' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'create') {
      return jsonOutput_({ error: 'Unknown action. Use action=create' });
    }

    validatePayload_(payload);

    const sheet = getOrCreateRecordSheet_();
    ensureHeader_(sheet, RECORD_HEADERS);

    sheet.appendRow([
      payload.date,
      payload.shift,
      payload.line,
      payload.machine,
      payload.productName,
      Number(payload.productionQty),
      Number(payload.totalCount ?? payload.productionQty),
      Number(payload.plannedMinutes),
      Number(payload.downtimeMinutes),
      Number(payload.goodCount),
      Number(payload.idealCycleTime),
      payload.notes || '',
    ]);

    return jsonOutput_({ ok: true });
  } catch (error) {
    return jsonOutput_({ error: error.message || String(error) });
  }
}

function listRecords_() {
  const sheet = getOrCreateRecordSheet_();
  ensureHeader_(sheet, RECORD_HEADERS);

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

function getDropdownOptions_() {
  const rows = listMasterRows_();
  const machineSet = new Set();
  const productSet = new Set();
  const productsByMachine = {};

  rows.forEach((row) => {
    const machine = String(row.machine || '').trim();
    const productName = String(row.product_name || '').trim();
    if (!machine || !productName) return;

    machineSet.add(machine);
    productSet.add(productName);

    if (!productsByMachine[machine]) productsByMachine[machine] = new Set();
    productsByMachine[machine].add(productName);
  });

  const machines = Array.from(machineSet).sort();
  const products = Array.from(productSet).sort();
  const mapped = {};

  Object.keys(productsByMachine).forEach((machine) => {
    mapped[machine] = Array.from(productsByMachine[machine]).sort();
  });

  return { machines, products, productsByMachine: mapped };
}

function listMasterRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MASTER_SHEET_NAME);

  if (!sheet) {
    // Fallback: find first sheet that has both product_name and machine columns.
    const found = ss.getSheets().find((s) => {
      const headers = s.getRange(1, 1, 1, Math.max(3, s.getLastColumn())).getValues()[0].map(String);
      return headers.includes('product_name') && headers.includes('machine');
    });
    if (!found) {
      throw new Error("Master sheet not found. Create sheet 'products_master' with columns: product_name, machine");
    }
    sheet = found;
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map((h) => String(h).trim());
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

function getOrCreateRecordSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RECORD_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(RECORD_SHEET_NAME);
  return sheet;
}

function ensureHeader_(sheet, expectedHeaders) {
  const current = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
  const empty = current.every((cell) => String(cell).trim() === '');

  if (empty) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return;
  }

  const same = expectedHeaders.every((header, i) => String(current[i] || '') === header);
  if (!same) sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
}

function validatePayload_(payload) {
  const required = [
    'date',
    'shift',
    'line',
    'machine',
    'productName',
    'productionQty',
    'plannedMinutes',
    'downtimeMinutes',
    'goodCount',
    'idealCycleTime',
  ];

  required.forEach((key) => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error('Missing required field: ' + key);
    }
  });

  const qty = Number(payload.productionQty);
  const planned = Number(payload.plannedMinutes);
  const down = Number(payload.downtimeMinutes);
  const good = Number(payload.goodCount);
  const ict = Number(payload.idealCycleTime);

  if (!Number.isFinite(qty) || qty < 0) throw new Error('productionQty must be >= 0');
  if (!Number.isFinite(planned) || planned <= 0) throw new Error('plannedMinutes must be > 0');
  if (!Number.isFinite(down) || down < 0) throw new Error('downtimeMinutes must be >= 0');
  if (!Number.isFinite(good) || good < 0) throw new Error('goodCount must be >= 0');
  if (!Number.isFinite(ict) || ict < 0) throw new Error('idealCycleTime must be >= 0');
  if (good > qty) throw new Error('goodCount must be <= productionQty');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
