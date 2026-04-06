/**
 * Google Apps Script backend for OEE web app
 * Sheet name: records
 * Header (row 1):
 * date,shift,line,machine,plannedMinutes,downtimeMinutes,totalCount,goodCount,idealCycleTime,notes
 */

const SHEET_NAME = 'records';
const HEADERS = [
  'date',
  'shift',
  'line',
  'machine',
  'plannedMinutes',
  'downtimeMinutes',
  'totalCount',
  'goodCount',
  'idealCycleTime',
  'notes',
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'list') {
    const sheet = getOrCreateSheet_();
    ensureHeader_(sheet);

    const range = sheet.getDataRange();
    const values = range.getValues();

    if (values.length <= 1) {
      return jsonOutput_({ records: [] });
    }

    const headers = values[0];
    const records = values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    return jsonOutput_({ records });
  }

  return jsonOutput_({ error: 'Unknown action. Use ?action=list' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'create') {
      return jsonOutput_({ error: 'Unknown action. Use action=create' });
    }

    const sheet = getOrCreateSheet_();
    ensureHeader_(sheet);

    validatePayload_(payload);

    sheet.appendRow([
      payload.date,
      payload.shift,
      payload.line,
      payload.machine,
      Number(payload.plannedMinutes),
      Number(payload.downtimeMinutes),
      Number(payload.totalCount),
      Number(payload.goodCount),
      Number(payload.idealCycleTime),
      payload.notes || '',
    ]);

    return jsonOutput_({ ok: true });
  } catch (error) {
    return jsonOutput_({ error: error.message || String(error) });
  }
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeader_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const empty = current.every((cell) => String(cell).trim() === '');

  if (empty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }

  // Optional: update existing headers if needed
  const same = HEADERS.every((header, i) => String(current[i] || '') === header);
  if (!same) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function validatePayload_(payload) {
  const required = [
    'date',
    'shift',
    'line',
    'machine',
    'plannedMinutes',
    'downtimeMinutes',
    'totalCount',
    'goodCount',
    'idealCycleTime',
  ];

  required.forEach((key) => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error('Missing required field: ' + key);
    }
  });

  const planned = Number(payload.plannedMinutes);
  const down = Number(payload.downtimeMinutes);
  const total = Number(payload.totalCount);
  const good = Number(payload.goodCount);
  const ict = Number(payload.idealCycleTime);

  if (!Number.isFinite(planned) || planned <= 0) throw new Error('plannedMinutes must be > 0');
  if (!Number.isFinite(down) || down < 0) throw new Error('downtimeMinutes must be >= 0');
  if (!Number.isFinite(total) || total < 0) throw new Error('totalCount must be >= 0');
  if (!Number.isFinite(good) || good < 0) throw new Error('goodCount must be >= 0');
  if (!Number.isFinite(ict) || ict < 0) throw new Error('idealCycleTime must be >= 0');
  if (good > total) throw new Error('goodCount must be <= totalCount');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
