/**
 * Google Apps Script backend for production dashboard.
 *
 * Required sheets:
 * 1) records
 * 2) products_master (fallback: first sheet with headers product_name,machine)
 */

const RECORD_SHEET_NAME = 'records';
const MASTER_SHEET_NAME = 'products_master';

const RECORD_HEADERS = [
  'date',
  'shift',
  'timeSlot',
  'line',
  'machine',
  'productName',
  'productionQty',
  'notes',
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'list') return jsonOutput_({ records: listRecords_() });
  if (action === 'options') return jsonOutput_(getDropdownOptions_());
  return jsonOutput_({ error: 'Unknown action. Use ?action=list or ?action=options' });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    if (payload.action !== 'create') return jsonOutput_({ error: 'Unknown action. Use action=create' });

    validatePayload_(payload);

    const sheet = getOrCreateRecordSheet_();
    ensureHeader_(sheet, RECORD_HEADERS);
    sheet.appendRow([
      payload.date,
      payload.shift,
      payload.timeSlot,
      payload.line,
      payload.machine,
      payload.productName,
      Number(payload.productionQty),
      payload.notes || '',
    ]);

    return jsonOutput_({ ok: true });
  } catch (error) {
    return jsonOutput_({ error: error.message || String(error) });
  }
}


function parsePayload_(e) {
  const params = (e && e.parameter) || {};
  if (Object.keys(params).length) return params;

  const raw = (e && e.postData && e.postData.contents) || '{}';
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
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
  const required = ['date', 'shift', 'timeSlot', 'line', 'machine', 'productName', 'productionQty'];
  required.forEach((key) => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error('Missing required field: ' + key);
    }
  });

  const qty = Number(payload.productionQty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error('productionQty must be >= 0');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
