# Nunu Run Review Generator

Originally written by [@Bandar Almansour](Bandar.Almansour@playmirai.com)

This script pulls runs from the Nunu API and appends them as rows into the active Google Sheet, one row per run. It fills in every field that can be derived from the API and leaves manual-entry fields blank for reviewers to complete.

---

## 1. System Overview

The script runs as a Google Apps Script bound to the review spreadsheet. It has to be pasted into the sheet's Apps Script project, the **Google Sheets Advanced Service** (identifier `Sheets`) has to be enabled, and the sheet reloaded so the `Nunu Sync` menu appears.

---

## 2. Functional Requirements

### Nunu Sync

Fetches runs from Nunu, filters and sorts them, and appends new rows to the active sheet. Runs already present (identified by their run link in the "Repo Name w/Link" column) are skipped.

#### Sync runs...:

- `Menu Item`
  - **Description:**
    - Opens the sync dialog for the active sheet. Available under the `Nunu Sync` menu that appears in the sheet's menu bar after the script is installed.

#### Nunu API Key:

- `Password Textbox`
  - **Description:**
    - The Nunu API key used for all HTTP calls. Required.

#### Test Plan ID:

- `Textbox`
  - **Description:**
    - Optional. A Test Plan UUID that is copied from the Test Plan History.
    - When set, every other filter is ignored.

#### From date:

- `Date input`
  - **Description:**
    - Required unless Test Plan ID is set. Only runs whose `started_at` is on or after this day are included.

#### To date:

- `Date input`
  - **Description:**
    - Optional. Only runs whose `started_at` is on or before end-of-day on this date are included.
    - When blank, defaults to the same value as From date.

#### Filter by test name:

- `Textbox`
  - **Description:**
    - Optional. Substring match (case-insensitive) against the test name. 

#### Filter by user ID:

- `Textbox`
  - **Description:**
    - Optional. Only runs whose `initiator.user_id` equals this exact value are included. Useful for a single tester's runs.

#### Max runs:

- `Number input`
  - **Description:**
    - Ceiling on the number of runs fetched. Default 200. The sync stops as soon as this many post-filter runs have been collected.

#### Fetch Runs:

- `Button`
  - **Description:**
    - Starts the sync. Disables itself while running and re-enables on success or failure.
    - On completion the status line shows either `Done! N runs inserted after row M.` or an error message.

---

## 3. Technical Architecture

### UI Component (Dialog Modal)

- **Styling:** Inline CSS scoped to the dialog. Arial 13px body, `#4a86e8` primary button that dims to `#aaa` when disabled, `#f1f3f4` badge for the active sheet name. The Test Plan mode note uses a warm-yellow (`#fff8dc` on `#e6d58a` border) to visually mark that a mode-changing option is active.
- **Layout:** Vertical form. Each field is a labelled block; hints render inline in `#999`. Divider lines separate the API key, the Test Plan mode field, and the standard filter block. Fixed 420×500 px modal.
- **Client-side wiring:** Small inline `<script>` block that toggles the Test Plan mode banner on input, disables the Fetch button while syncing, and invokes the server-side `syncNunu` function via `google.script.run`.

### Logic Component (GS)

The script is a fetch → enrich → write pipeline with no persistent state.

- **Fetch:** Paginates the Nunu runs list endpoint until the date window is exhausted or the user's row limit is reached. Runs are normalized into a clean internal shape so downstream code never touches the raw server response.

- **Filter:** The user's filters (dates, test name, user ID, or test plan mode) are applied client-side on top of whatever the server returned. Test Plan mode short-circuits every other filter.

- **Enrich:** Runs need two pieces of data the list endpoint doesn't return — platform and the bug list — so the script hits the run-details endpoint once per run. TestRail case counts come from a third endpoint (test details), cached per test ID so multiple runs of the same test share one call.

- **Sort:** Alphabetical by test name.

- **Project:** Each of the 17 columns is defined in two switch statements — one for cell value, one for cell formatting — both keyed by column name. Adding a column means adding a case to each. Manual-entry columns return empty specs and stay blank for the reviewer.

- **Write:** Two-pass, because Sheets has one bulk value API and one bulk formatting API but no bulk rich-text API.

  1. Collect all values into a 2D array and all formatting into a batchUpdate request list, walking rows × columns once.
  2. Push values with a single `setValues`, push formatting (per-cell number/validation/wrap, row-wide font/borders, sheet-wide conditional colors) with a single `batchUpdate`, flush, then set rich-text values one cell at a time for the bug column.

- **Bug URL slugs:** The `?p=<slug>` in a Nunu bug URL is undocumented — reverse-engineered as `base36(detected_at_ms - 100ms)`. Verified against real bug URLs before shipping.

- **Bug column:** Each cell contains one hyperlinked line per bug (`<index>:P<player>`), with per-line links routed to the correct player's URL by matching `player_number`. Built as a single rich-text value.

- **Dedup:** The Repo column's HYPERLINK formula embeds the run ID. Before inserting, the script scrapes existing rows for those IDs and skips any run already present, so re-running is idempotent.

Sheet Rows:

- One row per new run, inserted after the currently active row (or the last row if nothing is selected).
- 17 columns spanning B through R.
- Auto-filled: Date, Release Version, Environment, Platform, Repo Name (as a hyperlink), Status, Run Time, Invalid Bugs (rich-text hyperlinks), Number of Testrail TC's.
- Manual-entry: Tester, Issues, Review Time, Fixing Time, Valid Bugs, Bugs Reported, JIRA ID, Comments.
- Data validation dropdowns on Status and Issues, with conditional text colors per value.

---

## 4. User Interface (Mockup Reference)

Menu:

- `Nunu Sync` menu is added to the sheet's menu bar on load, containing a single `Sync runs...` item.

Sync Dialog:

- Title `Nunu Sync → <active sheet name>` with the sheet name in a rounded badge.
- Password field for the Nunu API Key.
- Text field for Test Plan ID with an inline banner that appears while the field has a value.
- Two date pickers (From / To).
- Text field for test-name substring filter.
- Text field for user ID filter.
- Number field for Max runs (default 200).
- Primary `Fetch Runs` button.
- Status line below the button that reports progress and completion or errors.

---

## 5. Security & Privacy

- **No credentials are stored.** The Nunu API key is entered per sync and lives only for the duration of the Apps Script server call; it is not persisted to script properties, document properties, or user properties.
- **All network traffic goes directly to Nunu.** The script only calls `https://nunu.ai/api/v1/*`. No third-party analytics, telemetry, or logging endpoints are contacted.
- **Runs on the user's Apps Script quota.** Every sync consumes `UrlFetchApp` calls under the account that authorized the script.
- **Idempotent by design.** Re-running the sync will not duplicate rows — dedup is based on the run ID embedded in the Repo hyperlink formula, so accidentally hitting Fetch twice is safe.