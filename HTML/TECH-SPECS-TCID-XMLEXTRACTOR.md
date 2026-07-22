# TC ID Converter Technical Specification

This tool allows converting TC (Test Case) IDs to Testrail links, and vice versa (links to TC IDs). This is useful because exporting TC IDs from Testrail only gives a plaintext ID, which makes referring back to the original in Testrail difficult.

---

## 1. System Overview

The tool has to be run on a browser platform, due it being built using vanilla web technology (HTML, CSS, JS). The tool does not have, or require a server backend, and operates fully on the users device.

---

## 2. Functional Requirements

### **🌑 / 🌞 (Theme Toggle)**

A Dark/Light mode switcher located at the top-right of the interface.

- `Button`
  - Tapping this button will switch the theme of the tool between Dark and Light modes.

---

### Convert TC ID to URL

converts IDs (ex. `C41621838`, `T123456` or `41614742`) to Testrail links.

#### TC ID:

- `Textbox`
  - **Description:**
    - Textbox used to input TC IDs that will be converted to links.
    - The tool not only supports comma separated, or line seprated values, but it should also *just* support text with TC IDs embedded inside it without major issues.

#### Options::Input (First is the default):

- Environment:
  - `Default (Prod)`.
  - `Stage`.
  - **Description:**
    - Scopely Testrail environment to use for the outputted result.
- Type:
  - `From ID`.
  - `Tests (Runs)`.
  - `Cases (Suites)`.
  - **Description:**
    - The type of the TC ID. The two supported types are `Tests (Runs)`, and `Cases (Suites)`.
      - These two options are mainly designed to be used with IDs that don't have a prefix (`T` or `C`).
      - When using these two options, any input data that already has a prefix will be force converted to the selected type.
    - `From ID` is a smart option that chooses the right type from the prefix (`T` or `C`).
      - The smart option will ignore input data that does not have a type prefix.
      - Input data that does not have a type prefix can still be used with the other two options, with the expectation that the user knows what type the input data is.
- CSV Export:
  - `Off`.
  - `On`.
  - **Description:**
    - When this is set to `On`, the output will be formatted to comma separated values.
    - When it is `Off`, which is the default, the output will be formatted with every TC ID on a newline.
- URL Shorten:
  - `On`.
  - `Off`.
  - **Description:**
    - When this is `Off` the text of the out links will be the full link (ex. [domain.testrail.com/cases/view/123456](ddg.gg)).
    - When this is set to `On` the link text will instead be shortened to just the prefix and the ID (ex. [C123456](ddg.gg)).

#### Convert✨:

- `Button`
  - **Description:**
    - This button will attempt to convert the input TC IDs into Testrail links.

#### TC URL(s):

- `Display`
  - **Description:**
    - Successfully created links are displayed here to the user.

#### Copy Buttons:

- `COPY`.
  - **Description:**
    - This button copies the created links from the output as plaintext.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.
- `COPY LINKS`.
  - **Description:**
    - This button copies the created links from the output as html (+plaintext). This will preserve the links better when pasting into other software.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.

---

### Convert TC URL to ID

converts Testrail links to IDs (ex. `C41621838`, `T123456` or `41614742`).

#### TC URL:

- `Textbox`
  - **Description:**
    - Textbox used to input Testrail links that will be converted to TC IDs.
    - Supports comma separated or line separated values.
    - While it is not designed for it, the tool should also *just* support text with Testrail links embedded inside it without major issues.

#### Options::Input (First is the default):

- Hyperlink:

  - `Yes`.
  - `No`.
  - **Description:**
    - When this is set to `No` the outputted TC IDs will be plaintext.
    - When this is set to `Yes` the outputted TC IDs will be links (ex. [C123456](ddg.gg)).

- CSV Export:

  - `Off`.
  - `On`.
  - **Description:**
    - When this is set to `On`, the output will be formatted to comma separated values.
    - When it is `Off` which is the default, the output will be formatted with every Testrail link on a newline.

#### Convert✨:

- `Button`
  - **Description:**
    - This button will attempt to convert the input Testrail links into TC IDs.

#### TC ID(s):

- `Display`
  - **Description:**
    - Successfully created IDs are displayed here to the user.

#### Copy Buttons:

- `COPY`.
  - **Description:**
    - This button copies the created IDs from the output as plaintext.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.
- `COPY LINKS`.
  - **Description:**
    - This button copies the created IDs from the output as html (+plaintext). When used with the `Hyperlink::Yes` option, this will perserve the links better when pasting into other software.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.

---

## 3. Technical Architecture

### UI Component (HTML/CSS)

- **Styling:** Uses CSS variables (`:root`) to manage themes. The layout is responsive, centered at a `max-width` of 980px.
- **Dark and Light Mode:** High contrast themes with a slightly blueish hue.

### Logic Component (JavaScript)

- **Regex Engine** Uses regular expressions to:

  - Identify numeric patterns within messy input strings.
  - Identify whether the URL belongs to a `test` or a `case` and prepends the appropriate letter ('T' or 'C').

- **URL Construction:** Dynamically builds strings using the following base:

  - Base: `https://scopely[.stage].testrail.com/index.php?/`
  - Suffix: `[tests/cases]/view/[ID]`

- Uses `document.createElement()` for generating results and `appendChild` for adding the results to the `display`.

---

## 4. User Interface (Mockup Reference)

Theme Toggle:

- Button to switch the theme in the top right corner.

Convert TC ID to URL:

- Title "Convert TC ID to URL"
- Large text area.
- 2x2 grid of dropdown menus.
- Primary "✨CONVERT" button.
- Expandable display area for results.
- 1x2 grid of Copy buttons.

Convert URL to TC ID:

- Title "Convert URL to TC ID"
- Large text area.
- 1x2 grid of dropdown menus.
- Primary "✨CONVERT" button.
- Expandable display area for results.
- 1x2 grid of Copy buttons.

---

## 5. Security & Privacy

- **No data is stored.** All inputs and outputs are cleared on page refresh.
- The tool does not utilize cookies or external analytics.

---

# **TestRail XML Field Extractor Technical Specification**

This tool allows extracting of TC (Test Case) fields from XML exports of Testrail Runs, into a table format.

## 1. System Overview

The tool has to be run on a browser platform, due it being built using vanilla web technology (HTML, CSS, JS). The tool does not have, or require a server backend, and operates fully on the users device.

## 2. Functional Requirements

### **🌑 / 🌞 (Theme Toggle)**

A Dark/Light mode switcher located at the top-right of the interface.

- `Button`
  - Tapping this button will switch the theme of the tool between Dark and Light modes.

---

### Testrail XML Field Extractor

Extract fields from Testrail Testrun XML files.

#### Testrail XML File:

- `Choose File`
  - **Description:**
    - The XML file that fields will be extracted from.
    - Only XML files exported from Testrail Testruns are valid.

#### Fields (Comma Separated):

- `Textbox (one line)`.
  - **Description:**
    - Valid `test` fields can be inputted by the user to be extracted.
    - Accepts comma separated fields (ex. `id, title, status`).
    - Each field will be outputted as a column, with the order of the columns matching what is in the Textbox.
    - Invalid fields will not be ignored, and will be outputted as `-`.

#### Output Buttons:

- `✨EXTRACT`.
  - **Description:**
    - This button extracts the fields from the `Textbox`.
- `✨AUTO EXTRACT`.
  - **Description:**
    - This button extracts the fields based on a preset that is defined currently in the code, with no user facing option.
      - **Lite Set:** Focused on high-level results, including `id`, `title`, `status`, `comment`, and `assignedto`.
      - **Full Set:** A comprehensive list of nearly 50 fields, including automation details (`Automation Type`, `Automation Script`), section hierarchy, and custom metadata.

#### Extracted Field(s):

- `Display`
  - **Description:**
    - Extracted fields are displayed here as a table to the user.
    - Invalid fields, or fields that were not found in the XML, will be displayed as `-` in the cells.

#### Copy Buttons:

- `COPY`.
  - **Description:**
    - This button copies the created table from the output as plaintext.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.
- `COPY LINKS`.
  - **Description:**
    - This button copies the created table from the output as html (+plaintext). This is to have better paste compatibility with other software. Also preserves new lines in comments better.
    - Button changes to `🎉COPIED!!` for 2 seconds upon interaction.

---

## **3.** Technical Architecture

### UI Component (HTML/CSS)

- **Styling:** Uses CSS variables (`:root`) to manage themes. The layout is responsive.
- **Dark and Light Mode:** High contrast themes with a slightly blueish hue.

### Logic Component (JavaScript)

- Uses `document.createElement()` for generating results and `appendChild` for adding the results to the `display`.

- Employs the `FileReader` API to read and ingest local `.xml` files selected by the user.

- Uses the `DOMParser` interface to navigate/parse the XML tree and locate `<test>` tags.

- The tool identifies tags containing HTML (specifically the `comment` tag) and uses a secondary `DOMParser` to extract clean inner text.

- Specific CSS styles (ex. `mso-data-placement:same-cell`) are injected into line breaks. This ensures that when the data is pasted into Microsoft Excel or Google Sheets, multi-line comments remain within a single cell rather than breaking across multiple rows.

---

## 4. User Interface (Mockup Reference)

Theme Toggle:

- Button to switch the theme in the top right corner.

Testrail XML Field Extractor:

- Title "Testrail XML Field Extractor"
- Choose File input.
- Custom Field Textbox input.
- 1x2 grid of Extract buttons.
- Expandable display area for results.
- 1x2 grid of Copy buttons.

---

## 5. Security & Privacy

- **No data is stored.** All inputs and outputs are cleared on page refresh.
- The tool does not utilize cookies or external analytics.