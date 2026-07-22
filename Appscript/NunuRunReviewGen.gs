/**
 * Nunu → Google Sheets Sync
 *
 * Setup:
 *   1. Open Extensions → Apps Script in your Google Sheet
 *   2. Paste this file and save
 *   3. Enable Advanced Google Services: Sheets API
 *   4. Reload the sheet — a "Nunu Sync" menu will appear
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const HEADERS = [
  "Date", "Release Version", "Environment", "Platform", "Tester",
  "Repo Name w/Link", "Status", "Issues", "Run Time",
  "Review Time (H/M)", "Fixing Time", "Valid Bugs (numbers)",
  "Invalid Bugs (numbers)", "Bugs Reported (numbers)", "JIRA ID",
  "Number of Testrail TC's", "Comments"
];

// Data starts at column B (column A is left empty by the template)
const START_COL     = 2;  // 1-indexed: column B
const COL_DATE      = 0;  // B
const COL_BUILD     = 1;  // C  — Release Version
const COL_ENV       = 2;  // D  — Environment
const COL_PLATFORM  = 3;  // E  — Platform
const COL_TESTER    = 4;  // F  — manual
const COL_REPO      = 5;  // G  — Repo Name w/Link
const COL_STATUS    = 6;  // H  — Status
const COL_ISSUES    = 7;  // I  — manual
const COL_RUNTIME   = 8;  // J  — Run Time

const STATUS_VALUES  = ["Completed w/issues", "Incomplete", "Stopped", "Error"];
const NUNU_TO_STATUS = {
  "SUCCESS":   "Completed w/issues",
  "MAX_STEPS": "Incomplete",
  "STOPPED":   "Stopped",
  "ERROR":     "Error",
};
const ISSUES_VALUES = ["Agent Issue", "Game/Config Issue", "Nunu Step Issue"];

const STATUS_TEXT_COLORS = {
  "Completed w/issues": "#11734b",
  "Incomplete":         "#473821",
  "Stopped":            "#bf9000",
  "Error":              "#cc0000",
};
const ISSUES_TEXT_COLORS = {
  "Agent Issue":       "#ffcfc9",
  "Game/Config Issue": "#0a53a8",
  "Nunu Step Issue":   "#7c2bb0",
};

const ROW_FG    = "#434343";
const NUNU_BASE = "https://nunu.ai/api/v1";


// ── Custom menu ────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Nunu Sync")
    .addItem("Sync runs...", "showSyncDialog")
    .addToUi();
}


// ── Dialog ────────────────────────────────────────────────────────────────────

function showSyncDialog() {
  const sheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();

  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;padding:16px;font-size:13px;}
      h3{margin-top:0;}
      label{display:block;margin-bottom:10px;}
      input{margin-top:3px;width:100%;box-sizing:border-box;padding:4px;}
      input[type=number]{width:80px;}
      .hint{color:#999;font-size:11px;}
      .divider{border-top:1px solid #ddd;margin:12px 0;}
      .sheet-badge{background:#f1f3f4;padding:3px 8px;border-radius:4px;font-weight:bold;}
      button{margin-top:8px;padding:8px 20px;background:#4a86e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;}
      button:disabled{background:#aaa;cursor:default;}
      button:hover:not(:disabled){background:#3a76d8;}
      #status{margin-top:10px;color:#555;font-size:12px;white-space:pre-wrap;}
    </style>
    <h3>Nunu Sync → <span class="sheet-badge">${sheetName}</span></h3>

    <div id="fetch-section">
      <label>Nunu API Key:
        <input id="apiKey" type="password" placeholder="nunu_..." />
      </label>
      <div class="divider"></div>
      <label>From date: <input id="from" type="date" /></label>
      <label>To date <span class="hint">(blank = same as From)</span>: <input id="to" type="date" /></label>
      <label>Filter by test name <span class="hint">(optional)</span>: <input id="filter" type="text" /></label>
      <label>Filter by user ID <span class="hint">(optional — runs started by this user only)</span>:
        <input id="userId" type="text" placeholder="e.g. 64b3f335-0f2e-..." />
      </label>
      <label>Max runs: <input id="limit" type="number" value="200" style="width:80px" /></label>
      <button id="fetchBtn" onclick="doSync()">Fetch Runs</button>
    </div>

    <p id="status"></p>

    <script>
      function doSync() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const from   = document.getElementById('from').value;
        const to     = document.getElementById('to').value || from;
        const filter = document.getElementById('filter').value.trim();
        const userId = document.getElementById('userId').value.trim();
        const limit  = parseInt(document.getElementById('limit').value) || 200;

        if (!apiKey) { setStatus('Please enter your Nunu API Key.'); return; }
        if (!from)   { setStatus('Please select a From date.'); return; }

        document.getElementById('fetchBtn').disabled = true;
        setStatus('Syncing...');

        google.script.run
          .withSuccessHandler(r => {
            document.getElementById('fetchBtn').disabled = false;
            setStatus(r);
          })
          .withFailureHandler(e => {
            document.getElementById('fetchBtn').disabled = false;
            setStatus('Error: ' + e.message);
          })
          .syncNunu(apiKey, from, to, limit, filter, userId);
      }

      function setStatus(msg) { document.getElementById('status').innerText = msg; }
    </script>
  `).setWidth(420).setHeight(390);
  SpreadsheetApp.getUi().showModalDialog(html, "Nunu Sync");
}


// ── Server: sync ──────────────────────────────────────────────────────────────

function syncNunu(apiKey, dateFrom, dateTo, limit, testNameFilter, userIdFilter) {
  const runs = fetchNunuRuns(apiKey, dateFrom, dateTo, limit, testNameFilter, userIdFilter);
  if (runs.length === 0) return "No runs found.";

  runs.sort(function(a, b) {
    if (a.started > b.started) return -1;
    if (a.started < b.started) return 1;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1
         : a.name.toLowerCase() > b.name.toLowerCase() ?  1 : 0;
  });

  const sheet     = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const anchorRow = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : sheet.getLastRow();
  writeToSheet(sheet, runs, anchorRow);
  return "Done! " + runs.length + " runs inserted after row " + anchorRow + ".";
}


// ── Nunu API ───────────────────────────────────────────────────────────────────

function fetchNunuRuns(apiKey, dateFrom, dateTo, limit, testNameFilter, userIdFilter) {
  const hdrs     = { "X-Api-Key": apiKey };
  const runs     = [];
  let page       = 0;
  const pageSize = 100;

  while (runs.length < limit) {
    const url  = NUNU_BASE + "/runs?page=" + page + "&page_size=" + pageSize;
    const res  = UrlFetchApp.fetch(url, { headers: hdrs, muteHttpExceptions: true });
    const body = JSON.parse(res.getContentText());
    const items = body.data || [];

    if (items.length === 0) break;

    for (let i = 0; i < items.length; i++) {
      if (runs.length >= limit) break;
      const item     = items[i];
      const started  = item.started_at || item.created_at || "";
      const testName = (item.test || {}).name || "";
      const initUid  = ((item.initiator || {}).value || {}).user_id ||
                       (item.initiator || {}).user_id || "";

      const afterFrom = !dateFrom || started >= dateFrom;
      const beforeTo  = !dateTo   || started <= dateTo + "T23:59:59";
      const matchName = !testNameFilter || testName.toLowerCase().indexOf(testNameFilter.toLowerCase()) !== -1;
      const matchUser = !userIdFilter   || initUid === userIdFilter;

      if (afterFrom && beforeTo && matchName && matchUser) {
        runs.push({
          run_id:     item.multiplayer_run_id || item.id,
          started:    started.slice(0, 10),
          name:       testName,
          result:     item.result || "",
          build_name: (item.build || {}).name || "",
          duration:   item.duration_ms || 0,
          players:    item.players || [],
        });
      }
    }

    const lastDate = (items[items.length - 1].started_at || "").slice(0, 10);
    if (dateFrom && lastDate < dateFrom) break;

    const totalPages = (body.pagination || {}).total_pages || 1;
    if (page >= totalPages - 1 || items.length < pageSize) break;
    page++;
  }

  return runs;
}


// ── Sheet writing ──────────────────────────────────────────────────────────────

function extractRunId(cellValue) {
  if (!cellValue) return null;
  const m = String(cellValue).match(/runs\/m\/([a-z0-9]+)\/details/);
  return m ? m[1] : null;
}

function writeToSheet(sheet, runs, anchorRow) {
  const numCols = HEADERS.length;

  // ── Skip runs already in the sheet ───────────────────────────────────────
  const existingRunIds = {};
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const existing = sheet.getRange(2, START_COL, lastRow - 1, numCols).getValues();
    for (let i = 0; i < existing.length; i++) {
      const runId = extractRunId(existing[i][COL_REPO]);
      if (runId) existingRunIds[runId] = i + 2;
    }
  }

  const newRuns = runs.filter(function(r) { return !existingRunIds[r.run_id]; });
  if (newRuns.length === 0) return;

  // ── Insert rows ───────────────────────────────────────────────────────────
  const insertAt = (anchorRow || sheet.getLastRow()) + 1;
  sheet.insertRowsAfter(insertAt - 1, newRuns.length);
  sheet.getRange(insertAt, START_COL, newRuns.length, numCols).clearFormat();

  const today    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const grid     = [];
  const dataRows = [];

  for (let i = 0; i < newRuns.length; i++) {
    const r       = newRuns[i];
    const runUrl  = "https://nunu.ai/nexus/monopoly-go/runs/m/" + r.run_id + "/details";
    const nameVal = '=HYPERLINK("' + runUrl + '","' + r.name.replace(/"/g, '""') + '")';

    const row = new Array(numCols).fill("");
    row[COL_DATE]     = today;
    row[COL_BUILD]    = r.build_name;
    row[COL_ENV]      = "Release";
    row[COL_PLATFORM] = "Android";
    // COL_TESTER (4) — manual
    row[COL_REPO]     = nameVal;
    row[COL_STATUS]   = NUNU_TO_STATUS[r.result] || "";
    // COL_ISSUES (7) — manual
    row[COL_RUNTIME]  = formatDuration(r.duration);
    // cols 9–16 — manual

    grid.push(row);
    dataRows.push({ sheetRow: insertAt + i });
  }

  sheet.getRange(insertAt, START_COL, grid.length, numCols).setValues(grid);

  // ── Batch formatting ───────────────────────────────────────────────────────
  if (typeof Sheets !== "undefined") {
    const ssId       = sheet.getParent().getId();
    const sheetId    = sheet.getSheetId();
    const reqs       = [];
    const rowFg      = hexToRgb(ROW_FG);
    const border     = { style: "SOLID", colorStyle: { rgbColor: { red: 0.78, green: 0.82, blue: 0.86 } } };
    const startColIdx = START_COL - 1; // 0-indexed

    for (let i = 0; i < dataRows.length; i++) {
      const ri = dataRows[i].sheetRow - 1; // 0-indexed

      reqs.push({ repeatCell: {
        range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: startColIdx, endColumnIndex: startColIdx + numCols },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: rowFg, fontFamily: "Arial", fontSize: 10 } } },
        fields: "userEnteredFormat.textFormat"
      }});

      reqs.push({ repeatCell: {
        range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: startColIdx + COL_DATE, endColumnIndex: startColIdx + COL_DATE + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
        fields: "userEnteredFormat.numberFormat"
      }});

      reqs.push({ updateBorders: {
        range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: startColIdx, endColumnIndex: startColIdx + numCols },
        top: border, bottom: border, left: border, right: border,
        innerHorizontal: border, innerVertical: border
      }});

      reqs.push(validationReq(sheetId, ri, startColIdx + COL_STATUS, STATUS_VALUES));
      reqs.push(validationReq(sheetId, ri, startColIdx + COL_ISSUES, ISSUES_VALUES));
    }

    sheet.clearConditionalFormatRules();
    const lastDataRow = sheet.getMaxRows();
    addConditionalFormatRules(reqs, sheetId, startColIdx + COL_STATUS, STATUS_TEXT_COLORS, lastDataRow);
    addConditionalFormatRules(reqs, sheetId, startColIdx + COL_ISSUES, ISSUES_TEXT_COLORS, lastDataRow);

    Sheets.Spreadsheets.batchUpdate({ requests: reqs }, ssId);
  } else {
    // Fallback: SpreadsheetApp calls (slower)
    for (let i = 0; i < dataRows.length; i++) {
      const sheetRow = dataRows[i].sheetRow;
      const range    = sheet.getRange(sheetRow, START_COL, 1, numCols);
      range.setFontColor(ROW_FG);
      range.setFontFamily("Arial");
      range.setFontSize(10);
      range.setBorder(true, true, true, true, true, true, "#c7d1db", SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(sheetRow, START_COL + COL_DATE).setNumberFormat("yyyy-mm-dd");
      sheet.getRange(sheetRow, START_COL + COL_STATUS).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, false).build());
      sheet.getRange(sheetRow, START_COL + COL_ISSUES).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(ISSUES_VALUES, false).build());
    }
  }
}

function hexToRgb(hex) {
  return {
    red:   parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue:  parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function addConditionalFormatRules(reqs, sheetId, colIndex, colorMap, endRow) {
  Object.keys(colorMap).forEach(function(value) {
    const fg = hexToRgb(colorMap[value]);
    reqs.push({ addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
          format: { textFormat: { bold: true, foregroundColor: fg } },
        },
      },
      index: 0,
    }});
  });
}

function validationReq(sheetId, ri, ci, values) {
  return { setDataValidation: {
    range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: ci, endColumnIndex: ci+1 },
    rule: {
      condition: { type: "ONE_OF_LIST", values: values.map(function(v) { return { userEnteredValue: v }; }) },
      showCustomUi: true, strict: false
    }
  }};
}

function formatDuration(ms) {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + "m " + (s % 60) + "s";
}
