/**
 * Nunu → Google Sheets Sync
 *
 * Write flow (see writeGrid): each cell is described twice, once per API.
 *
 *   valueSpec(run, column)   → { value | richText } — for the SpreadsheetApp bulk value write
 *   formatSpec(run, column)  → { numberFormat, validation, wrap, ... } — for the Sheets batchUpdate
 *
 * Both are switches keyed by column name. `writeGrid` calls each one per (row, column),
 * collects the specs, and flushes them in two bulk API calls at the end.
 */


// ── Constants ─────────────────────────────────────────────────────────────────

const NUNU_BASE  = "https://nunu.ai/api/v1";
const PROJECT_ID = "monopoly-go";
const START_COL  = 2;
const ROW_FG     = "#434343";

const NUNU_TO_STATUS = {
  "SUCCESS":   "Completed w/issues",
  "FAILED":    "Incomplete",
  "MAX_STEPS": "Incomplete",
  "STOPPED":   "Stopped",
  "ERROR":     "Error",
};


// ── Sheet layout ─────────────────────────────────────────────────────────────

const COLUMNS = [
  "date", "build", "env", "platform", "tester",
  "repo", "status", "issues", "runtime",
  "reviewTime", "fixingTime", "validBugs",
  "invalidBugs", "bugsReported", "jira",
  "testrailCount", "comments",
];

const HEADER = {
  date: "Date", build: "Release Version", env: "Environment", platform: "Platform",
  tester: "Tester", repo: "Repo Name w/Link", status: "Status", issues: "Issues",
  runtime: "Run Time", reviewTime: "Review Time (H/M)", fixingTime: "Fixing Time",
  validBugs: "Valid Bugs (numbers)", invalidBugs: "Invalid Bugs (numbers)",
  bugsReported: "Bugs Reported (numbers)", jira: "JIRA ID",
  testrailCount: "Number of Testrail TC's", comments: "Comments",
};

const COL_REPO_INDEX = COLUMNS.indexOf("repo");

const STATUS_COLORS = {
  "Completed w/issues": "#11734b",
  "Incomplete":         "#473821",
  "Stopped":            "#bf9000",
  "Error":              "#cc0000",
};
const ISSUES_COLORS = {
  "Agent Issue":       "#ffcfc9",
  "Game/Config Issue": "#0a53a8",
  "Nunu Step Issue":   "#7c2bb0",
};


// ═══════════════════════════════════════════════════════════════════════════════
// CELL WRITERS — one branch per column in each switch
// ═══════════════════════════════════════════════════════════════════════════════
// To change ANYTHING about how a column is written:
//   • What VALUE goes in it            → edit valueSpec()  case
//   • What FORMATTING is applied       → edit formatSpec() case
// Both switches use the same column-name cases so they read side by side.
// ═══════════════════════════════════════════════════════════════════════════════


// What value goes in the cell. Returns { value } or { richText }.
// Missing / empty return means the cell stays blank (manual column).
function valueSpec(run, column) {
  switch (column) {

    case "date":     return { value: run.startedDay };
    case "build":    return { value: run.buildName };
    case "env":      return { value: "Release" };
    case "platform": return { value: run.platform };
    case "tester":   return {};

    case "repo": {
      const url = "https://nunu.ai/nexus/" + PROJECT_ID + "/runs/m/" + run.id + "/details";
      return { value: '=HYPERLINK("' + url + '","' + run.name.replace(/"/g, '""') + '")' };
    }

    case "status":  return { value: NUNU_TO_STATUS[run.result] || "" };
    case "issues":  return {};
    case "runtime": return { value: formatDuration(run.durationMs) };

    case "invalidBugs":
      return { richText: bugRichText(run) };

    case "testrailCount":
      return { value: run.testrailCount === "" ? "" : run.testrailCount };

    case "reviewTime": case "fixingTime": case "validBugs":
    case "bugsReported": case "jira": case "comments":
      return {};
  }
}


// What formatting the cell gets. Returns any subset of:
//   { numberFormat, validation, wrap }
// where numberFormat is a Sheets NumberFormat, validation is a string[],
// and wrap is true|false.
function formatSpec(run, column) {
  switch (column) {

    case "date":
      return { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } };

    case "status":
      return { validation: ["Completed w/issues", "Incomplete", "Stopped", "Error"] };

    case "issues":
      return { validation: ["Agent Issue", "Game/Config Issue", "Nunu Step Issue"] };

    case "invalidBugs": {
      if (!run.bugs.length || !run.players.length) return {};
     const labels = run.bugs.map(function(bug, i) {
       return (i + 1) + ":P" + bug.playerNumber;
     });
     return { value: labels.join("\n"), richText: bugRichText(run) };
    }

    // All other columns — no per-cell formatting beyond the row-wide style.
    case "build": case "env": case "platform": case "tester":
    case "repo":  case "runtime":
    case "reviewTime": case "fixingTime": case "validBugs":
    case "bugsReported": case "jira": case "testrailCount": case "comments":
      return {};
  }
}


// ── Bug rich text — pure function, returns a RichTextValue ───────────────────
// The bug cell is the one column that can't ride the setValues() bulk write,
// because it needs one hyperlink per line. Called by valueSpec() above.

function bugRichText(run) {
  if (!run.bugs.length || !run.players.length) return null;

  // Label format for each line — change here to change how bugs display.
  const labels = run.bugs.map(function(bug, i) {
    return (i + 1) + ":P" + bug.playerNumber;
  });

  const builder = SpreadsheetApp.newRichTextValue().setText(labels.join("\n"));
  let idx = 0;
  for (let i = 0; i < run.bugs.length; i++) {
    const bug = run.bugs[i];

    // Match bug's player_number to the run's player id (fallback to player 1).
    let player = run.players[0];
    for (let p = 0; p < run.players.length; p++) {
      if (run.players[p].playerNumber === bug.playerNumber) { player = run.players[p]; break; }
    }

    const url = "https://nunu.ai/nexus/" + PROJECT_ID + "/runs/c/" + player.id + "?p=" + bug.slug;
    builder.setLinkUrl(idx, idx + labels[i].length, url);
    idx += labels[i].length + 1;
  }

  return builder.build();
}


// ── Menu / dialog ─────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Nunu Sync")
    .addItem("Sync runs...", "showSyncDialog").addToUi();
}

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
      .plan-note{background:#fff8dc;border:1px solid #e6d58a;padding:6px 8px;border-radius:4px;font-size:11px;color:#665500;margin-top:4px;}
      button{margin-top:8px;padding:8px 20px;background:#4a86e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;}
      button:disabled{background:#aaa;cursor:default;}
      button:hover:not(:disabled){background:#3a76d8;}
      #status{margin-top:10px;color:#555;font-size:12px;white-space:pre-wrap;}
    </style>
    <h3>Nunu Sync → <span class="sheet-badge">${sheetName}</span></h3>
    <label>Nunu API Key: <input id="apiKey" type="password" placeholder="nunu_..." /></label>
    <div class="divider"></div>
    <label>Test Plan ID <span class="hint">(optional — when set, ignores all filters below)</span>:
      <input id="testPlan" type="text" placeholder="e.g. 894a9b84-7410-4794-af7a-17a064c6e65f" />
    </label>
    <div class="plan-note" id="planNote" style="display:none">Test Plan mode: only runs in this plan will be synced. Date, test name, and user ID filters are ignored.</div>
    <div class="divider"></div>
    <label>From date: <input id="from" type="date" /></label>
    <label>To date <span class="hint">(blank = same as From)</span>: <input id="to" type="date" /></label>
    <label>Filter by test name <span class="hint">(optional)</span>: <input id="filter" type="text" /></label>
    <label>Filter by user ID <span class="hint">(optional)</span>:
      <input id="userId" type="text" placeholder="e.g. 64b3f335-0f2e-..." />
    </label>
    <label>Max runs: <input id="limit" type="number" value="200" style="width:80px" /></label>
    <button id="fetchBtn" onclick="doSync()">Fetch Runs</button>
    <p id="status"></p>
    <script>
      const planInput = document.getElementById('testPlan');
      const planNote  = document.getElementById('planNote');
      planInput.addEventListener('input', () => {
        planNote.style.display = planInput.value.trim() ? 'block' : 'none';
      });
      function doSync() {
        const apiKey   = document.getElementById('apiKey').value.trim();
        const testPlan = planInput.value.trim();
        const from     = document.getElementById('from').value;
        const to       = document.getElementById('to').value || from;
        const filter   = document.getElementById('filter').value.trim();
        const userId   = document.getElementById('userId').value.trim();
        const limit    = parseInt(document.getElementById('limit').value) || 200;
        if (!apiKey) return setStatus('Please enter your Nunu API Key.');
        if (!testPlan && !from) return setStatus('Please select a From date, or enter a Test Plan ID.');
        document.getElementById('fetchBtn').disabled = true;
        setStatus('Syncing...');
        google.script.run
          .withSuccessHandler(r => { document.getElementById('fetchBtn').disabled = false; setStatus(r); })
          .withFailureHandler(e => { document.getElementById('fetchBtn').disabled = false; setStatus('Error: ' + e.message); })
          .syncNunu(apiKey, from, to, limit, filter, userId, testPlan);
      }
      function setStatus(msg) { document.getElementById('status').innerText = msg; }
    </script>
  `).setWidth(420).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, "Nunu Sync");
}


// ── Orchestrator ──────────────────────────────────────────────────────────────

function syncNunu(apiKey, dateFrom, dateTo, limit, testNameFilter, userIdFilter, testPlanId) {
  const filters = testPlanId
    ? { testPlanId: testPlanId }
    : { dateFrom, dateTo, testNameFilter, userIdFilter };

  const raw      = collectRuns(apiKey, filters, limit);
  const filtered = filterRuns(raw, filters);
  enrichRunDetails(filtered, apiKey);
  enrichWithTestrailCounts(filtered, apiKey);
  const runs     = sortRuns(filtered);
  if (!runs.length) return "No runs found.";

  const sheet     = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const anchorRow = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : sheet.getLastRow();
  const inserted  = writeGrid(sheet, runs, anchorRow);

  return "Done! " + inserted + " runs inserted after row " + anchorRow + ".";
}


// ── Fetch / normalize / enrich / filter / sort (unchanged) ───────────────────

function collectRuns(apiKey, filters, limit) {
  const runs  = [];
  const pager = { page: 0, pageSize: 100, done: false };
  while (!pager.done && runs.length < limit) {
    const rawItems = fetchRawPage(apiKey, pager, filters);
    if (!rawItems.length) break;
    for (let i = 0; i < rawItems.length && runs.length < limit; i++) {
      runs.push(normalizeRun(rawItems[i]));
    }
    if (filters.dateFrom) {
      const lastDay = (rawItems[rawItems.length - 1].started_at || "").slice(0, 10);
      if (lastDay < filters.dateFrom) break;
    }
  }
  return runs;
}

function fetchRawPage(apiKey, pager, filters) {
  let url = NUNU_BASE + "/runs?page=" + pager.page + "&page_size=" + pager.pageSize;
  if (filters.testPlanId) url += "&test_plan_execution_id=" + encodeURIComponent(filters.testPlanId);
  const res  = UrlFetchApp.fetch(url, { headers: { "X-Api-Key": apiKey }, muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText());
  const items = body.data || [];
  const totalPages = (body.pagination || {}).total_pages || 1;
  pager.page++;
  if (pager.page >= totalPages || items.length < pager.pageSize) pager.done = true;
  return items;
}

function normalizeRun(item) {
  const started = item.started_at || item.created_at || "";
  const bugInfo = item.bug_info || {};

  return {
    id:                  item.multiplayer_run_id || item.id,
    startedAt:           started,
    startedDay:          started.slice(0, 10),
    name:                (item.test  || {}).name || "",
    testId:              (item.test  || {}).id   || "",
    result:              item.result || "",
    buildName:           (item.build || {}).name || "",
    durationMs:          item.duration_ms || 0,
    initiatorUserId:     ((item.initiator || {}).value || {}).user_id ||
                         (item.initiator || {}).user_id || "",
    testPlanExecutionId: item.test_plan_execution_id || "",
    bugCount:            bugInfo.bug_count || 0,
    players:             (item.players || []).map(function(p) {
      return { id: p.id, playerNumber: p.player_number };
    }),
    bugs: [],
    testrailCount: "",
  };
}

function filterRuns(runs, f) {
  return runs.filter(function(r) {
    if (f.testPlanId) return r.testPlanExecutionId === f.testPlanId;
    if (f.dateFrom       && r.startedAt < f.dateFrom) return false;
    if (f.dateTo         && r.startedAt > f.dateTo + "T23:59:59") return false;
    if (f.testNameFilter && r.name.toLowerCase().indexOf(f.testNameFilter.toLowerCase()) === -1) return false;
    if (f.userIdFilter   && r.initiatorUserId !== f.userIdFilter) return false;
    return true;
  });
}

function enrichRunDetails(runs, apiKey) {
  runs.forEach(function(r) {
    const detail = fetchRunDetails(apiKey, r.id);
    const players = detail.players || [];

    // Platform from Player 1.
    const kind = ((players[0] || {}).platform || {}).kind || "";
    r.platform = kind.indexOf("android") !== -1 ? "Android"
               : kind.indexOf("ios")     !== -1 ? "iOS"
               : "";

    // Bugs.
    r.bugs = (detail.bugs || []).map(function(b) {
      return {
        title:        b.title || "",
        detectedAt:   b.detected_at,
        playerNumber: b.player_number,
        slug:         slugFromDetectedAt(b.detected_at),
      };
    });
    r.bugCount = r.bugs.length;
  });
}

function fetchRunDetails(apiKey, runId) {
  const url  = NUNU_BASE + "/project/" + PROJECT_ID + "/runs/" + runId;
  const res  = UrlFetchApp.fetch(url, { headers: { "X-Api-Key": apiKey }, muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText());
  return body.run || body;   // MCP wraps in {run: ...}; the direct API may not
}

// TestRail case count = distinct case IDs across every step of the test's
// latest version. Nunu doesn't preserve historical TestRail mappings when a
// test is re-versioned, so "latest" is all we can retrieve. Cached per test id
// so multiple runs of the same test only fetch once.
function enrichWithTestrailCounts(runs, apiKey) {
  const cache = {};
  runs.forEach(function(r) {
    if (!r.testId) return;
    if (cache[r.testId] === undefined) cache[r.testId] = countTestrailCases(fetchTest(apiKey, r.testId));
    r.testrailCount = cache[r.testId];
  });
}

function countTestrailCases(testBody) {
  const byKey = (testBody.test || testBody).players_by_key || {};
  const ids   = {};
  Object.keys(byKey).forEach(function(pk) {
    const items = (byKey[pk] || {}).items_by_key || {};
    Object.keys(items).forEach(function(ik) {
      const versions = ((items[ik].testrail || {}).versions) || {};
      Object.keys(versions).forEach(function(v) {
        (versions[v].cases || []).forEach(function(c) { ids[c.id] = true; });
      });
    });
  });
  return Object.keys(ids).length;
}

function fetchTest(apiKey, testId) {
  const url  = NUNU_BASE + "/project/" + PROJECT_ID + "/tests/" + testId;
  const res  = UrlFetchApp.fetch(url, { headers: { "X-Api-Key": apiKey }, muteHttpExceptions: true });
  return JSON.parse(res.getContentText());
}

function slugFromDetectedAt(iso) {
  return (new Date(iso).getTime() - 100).toString(36);
}

function sortRuns(runs) {
  return runs.slice().sort(function(a, b) {
    const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// WRITE PATH — collect specs from both switches, then two bulk API calls
// ═══════════════════════════════════════════════════════════════════════════════

function writeGrid(sheet, runs, anchorRow) {
  const existingIds = readExistingRunIds(sheet);
  const fresh = runs.filter(function(r) { return !existingIds[r.id]; });
  if (!fresh.length) return 0;

  const insertAt = (anchorRow || sheet.getLastRow()) + 1;
  sheet.insertRowsAfter(insertAt - 1, fresh.length);
  sheet.getRange(insertAt, START_COL, fresh.length, COLUMNS.length).clearFormat();

  // Walk every cell once. Each cell contributes to at most three buckets:
  //   values[]     — plain scalar/formula cell values (bulk setValues)
  //   formatReqs[] — Sheets API batchUpdate requests (bulk batchUpdate)
  //   richCells[]  — cells that need setRichTextValue (per-cell, unavoidable)
  const values      = [];
  const formatReqs  = [];
  const richCells   = [];
  const startColIdx = START_COL - 1;
  const sheetId     = sheet.getSheetId();

  for (let i = 0; i < fresh.length; i++) {
    const run = fresh[i];
    const rowValues = [];
    const ri = insertAt + i - 1;

    for (let c = 0; c < COLUMNS.length; c++) {
      const column = COLUMNS[c];
      const ci     = startColIdx + c;

      const val = valueSpec(run, column);
      const fmt = formatSpec(run, column);

      rowValues.push(val.value === undefined ? "" : val.value);
      if (val.richText) richCells.push({ row: insertAt + i, col: START_COL + c, rt: val.richText });

      if (fmt.numberFormat) formatReqs.push(numberFormatReq(sheetId, ri, ci, fmt.numberFormat));
      if (fmt.validation)   formatReqs.push(validationReq  (sheetId, ri, ci, fmt.validation));
      if (fmt.wrap)         formatReqs.push(wrapReq        (sheetId, ri, ci));
    }
    values.push(rowValues);
  }

  // Bulk value write (one round trip).
  sheet.getRange(insertAt, START_COL, fresh.length, COLUMNS.length).setValues(values);

  // Row-wide style (font, borders) added to the same batch.
  addRowStyleRequests(formatReqs, sheetId, insertAt, fresh.length);
  // Sheet-wide conditional formats (Status colors, Issues colors) added too.
  addConditionalFormatRequests(formatReqs, sheetId, sheet.getMaxRows());

  sheet.clearConditionalFormatRules();
  Sheets.Spreadsheets.batchUpdate({ requests: formatReqs }, sheet.getParent().getId());

  SpreadsheetApp.flush();   // ← NEW: land pending setValues before the overlay

  // Rich-text cells — no bulk API exists. One call per bug-having row.
  richCells.forEach(function(rc) { sheet.getRange(rc.row, rc.col).setRichTextValue(rc.rt); });

  return fresh.length;
}


// ── batchUpdate request builders — pure functions ────────────────────────────

function numberFormatReq(sheetId, ri, ci, numberFormat) {
  return { repeatCell: {
    range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: ci, endColumnIndex: ci+1 },
    cell:  { userEnteredFormat: { numberFormat: numberFormat } },
    fields: "userEnteredFormat.numberFormat"
  }};
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

function wrapReq(sheetId, ri, ci) {
  return { repeatCell: {
    range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: ci, endColumnIndex: ci+1 },
    cell:  { userEnteredFormat: { wrapStrategy: "WRAP" } },
    fields: "userEnteredFormat.wrapStrategy"
  }};
}

function addRowStyleRequests(reqs, sheetId, insertAt, numRows) {
  const startColIdx = START_COL - 1;
  const rowFg  = hexToRgb(ROW_FG);
  const border = { style: "SOLID", colorStyle: { rgbColor: { red: 0.78, green: 0.82, blue: 0.86 } } };

  for (let i = 0; i < numRows; i++) {
    const ri = insertAt + i - 1;
    reqs.push({ repeatCell: {
      range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: startColIdx, endColumnIndex: startColIdx + COLUMNS.length },
      cell:  { userEnteredFormat: { textFormat: { foregroundColor: rowFg, fontFamily: "Arial", fontSize: 10 } } },
      fields: "userEnteredFormat.textFormat"
    }});
    reqs.push({ updateBorders: {
      range: { sheetId, startRowIndex: ri, endRowIndex: ri+1, startColumnIndex: startColIdx, endColumnIndex: startColIdx + COLUMNS.length },
      top: border, bottom: border, left: border, right: border, innerHorizontal: border, innerVertical: border
    }});
  }
}

function addConditionalFormatRequests(reqs, sheetId, endRow) {
  const startColIdx = START_COL - 1;
  pushConditionalColors(reqs, sheetId, startColIdx + COLUMNS.indexOf("status"), STATUS_COLORS, endRow);
  pushConditionalColors(reqs, sheetId, startColIdx + COLUMNS.indexOf("issues"), ISSUES_COLORS, endRow);
}

function pushConditionalColors(reqs, sheetId, colIndex, colorMap, endRow) {
  Object.keys(colorMap).forEach(function(value) {
    reqs.push({ addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
          format:    { textFormat: { bold: true, foregroundColor: hexToRgb(colorMap[value]) } },
        },
      },
      index: 0,
    }});
  });
}


// ── Dedup existing rows ──────────────────────────────────────────────────────

function readExistingRunIds(sheet) {
  const map     = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return map;
  const values = sheet.getRange(2, START_COL, lastRow - 1, COLUMNS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const id = extractRunId(values[i][COL_REPO_INDEX]);
    if (id) map[id] = i + 2;
  }
  return map;
}

function extractRunId(cellValue) {
  if (!cellValue) return null;
  const m = String(cellValue).match(/runs\/m\/([a-z0-9]+)\/details/);
  return m ? m[1] : null;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return {
    red:   parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue:  parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function formatDuration(ms) {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + "m " + (s % 60) + "s";
}
