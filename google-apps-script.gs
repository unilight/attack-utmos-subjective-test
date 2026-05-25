const SHEET_NAME = "responses";
const SUMMARY_SHEET_NAME = "summary";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = getOrCreateSheet_(spreadsheet, SHEET_NAME);
  const summarySheet = getOrCreateSheet_(spreadsheet, SUMMARY_SHEET_NAME);
  const rows = payload.rows || [];
  const columns = [
    "received_at",
    "test_id",
    "session_id",
    "listener_id",
    "started_at",
    "finished_at",
    "item_index",
    "sample_id",
    "system_id",
    "system_label",
    "audio_path",
    "score",
    "rated_at"
  ];

  ensureHeader_(responseSheet, columns);

  const receivedAt = new Date().toISOString();
  rows.forEach(function(row) {
    responseSheet.appendRow(columns.map(function(column) {
      if (column === "received_at") return receivedAt;
      if (column === "test_id") return payload.test_id || "";
      return row[column] || "";
    }));
  });

  updateSummary_(responseSheet, summarySheet);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, rows: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeader_(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    return;
  }
  const header = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
  if (header.join("\t") !== columns.join("\t")) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
}

function updateSummary_(responseSheet, summarySheet) {
  const values = responseSheet.getDataRange().getValues();
  const header = values.shift();
  const systemIndex = header.indexOf("system_id");
  const labelIndex = header.indexOf("system_label");
  const scoreIndex = header.indexOf("score");
  const bySystem = {};

  values.forEach(function(row) {
    const systemId = row[systemIndex];
    const score = Number(row[scoreIndex]);
    if (!systemId || !score) return;
    if (!bySystem[systemId]) {
      bySystem[systemId] = { system_id: systemId, system_label: row[labelIndex], n: 0, sum: 0 };
    }
    bySystem[systemId].n += 1;
    bySystem[systemId].sum += score;
  });

  const summaryRows = [["system_id", "system_label", "n", "mean_score"]];
  Object.keys(bySystem).sort().forEach(function(systemId) {
    const item = bySystem[systemId];
    summaryRows.push([item.system_id, item.system_label, item.n, item.sum / item.n]);
  });

  summarySheet.clearContents();
  summarySheet.getRange(1, 1, summaryRows.length, summaryRows[0].length).setValues(summaryRows);
}
