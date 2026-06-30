# AI PDF Studio — Usage Guide

## Overview

AI PDF Studio is an intelligent document processing platform that extracts, validates, and manages structured data from PDFs and other document formats. It uses AI to read your documents, apply business rules, route approvals, and detect anomalies — without manual data entry.

---

## Getting Started

### Uploading a Document

Supported formats: **PDF, Word (.docx), Excel (.xlsx), PNG, JPG, TIFF**

1. Open the platform in your browser.
2. In the **Upload** panel at the top, drag and drop your file or click to browse.
3. The platform confirms the upload with the filename, page count, and file size.
4. Your file is now available across all tabs.

> Word and Excel files are automatically converted to PDF internally. Images are embedded as single-page documents. All formats behave identically after upload.

---

## Core Tabs

### Files

Your central hub for all uploaded and processed documents.

**What you can do:**
- View all files with their status, template, page count, and upload date.
- Click any file to open a detailed view showing all extracted fields.
- Edit any extracted field value inline by clicking the pencil icon.
- Add new fields or delete existing ones using the controls inside the file detail.
- Change a file's workflow status using the status panel on the right.
- Assign a file to a team member by entering their name in the **Assigned To** field.

**Bulk actions:**
- Tick the checkboxes on multiple files.
- Use the blue bar that appears at the top to change status or delete all selected files at once.

**Per-file actions (inside the file detail view):**

| Button | What it does |
|--------|-------------|
| Refine with AI | Give Claude instructions to correct or improve specific extracted values |
| Smart Extract | Let Claude analyse the document and extract all fields automatically, without needing a template |
| Re-extract | Re-run extraction using a different template |
| Delete | Remove the file record |

---

### Templates

Templates define the fields you want to extract from a specific document type (e.g. Commercial Invoice, Packing List, Bill of Lading).

**Creating a template:**
1. Click **New Template**.
2. Enter a name and document type.
3. Add the field names you want extracted (e.g. `Invoice Number`, `Shipper Name`, `Total Amount`).
4. Optionally add table columns for line-item data.
5. Set **Unique ID Fields** — fields like `Invoice Number` that uniquely identify a document (used for duplicate detection).
6. Save the template.

**Running extraction:**
1. Upload a document.
2. Go to **Templates**, select your template, and click **Extract Data** with your file selected.
3. Results appear in the **Files** tab with all field values populated.

**Smart Extract (no template needed):**
Open any file in the Files tab and click **Smart Extract**. Claude will read the document, determine its type, and pull out all visible fields without any configuration.

---

### Workflow

Defines the stages a document moves through — from receipt to approval.

**Default stages:** New → Validation → Pre-Approved → Approved → Rejected

**Customising stages:**
- Click **Add State** to create a new stage.
- Drag the up/down arrows to reorder stages.
- Edit or delete any stage by name.

**Approval Routing:**
Below the stages list, you can configure automatic assignment rules:

| Field | Description |
|-------|-------------|
| State | The workflow stage that triggers the rule |
| Approver | The person or email automatically assigned when a file enters this stage |
| Escalate after | Hours before the file is flagged as overdue |

When a file's status is changed to a routed stage (manually or via bulk action), the platform automatically assigns the configured approver and starts the escalation timer.

---

### Rules

Automation rules that trigger when a document is extracted or reaches a certain workflow state.

**Creating a rule:**
1. Click **New Rule** to open the step-by-step wizard.
2. Choose a trigger type: **On Extraction** (runs after data is pulled) or **On Status Change**.
3. Optionally preview a file to test conditions against real data.
4. Describe your rule in plain English and let AI generate the conditions.
5. Set the action: change status, flag a field, assign the file, etc.
6. Save and activate.

Rules run automatically — no manual steps required after setup.

---

### Library

Lookup tables your rules and extractions can reference — for example, a list of approved supplier codes, port names, or currency codes.

**Creating a library:**
1. Click **New Library**, give it a name, and define column names.
2. Add rows manually or import from a CSV file.
3. Use the search bar to find entries quickly.

Libraries can be used in rules to validate extracted field values against known lists.

---

### Security

Controls who can access the platform and what they can do.

**Roles:** Create roles (e.g. Reviewer, Admin) and assign specific permissions to each.

**Users:** Add team members and assign them a role.

**API Keys:** Generate API keys for programmatic access. Keys are shown only once — copy them immediately.

**Settings:** Toggle MFA, set session timeout, configure maximum file size, enable IP whitelisting, and control audit log retention.

---

### Export

Send extracted data out of the platform.

**Export formats:**

| Format | Best for |
|--------|----------|
| CSV | Spreadsheet tools, data imports |
| Excel | Formatted reports with styled headers |
| JSON | Developer integrations, custom systems |

**How to export:**
1. Go to the **Export** tab.
2. Select which files to include (search or tick individually).
3. Choose a format and click **Download**.

**ERP / System Integrations:**
Configure connections to external systems (SAP, CargoWise, custom APIs):
1. Click **Add Integration**.
2. Enter the endpoint URL and choose an auth method (Bearer token, API Key, or Basic auth).
3. Map your field names to the field names the external system expects.
4. Use **Test Connection** to verify before going live.
5. Click **Push Files** to send selected files to the integration on demand.

---

## Advanced Features

### Smart Extract

Available on any file in the Files tab. No template configuration required.

Claude reads the document, determines what type it is (e.g. "Commercial Invoice"), and extracts every visible field and table into structured data. Useful for:
- One-off documents that don't fit an existing template.
- Rapidly processing unknown document types.
- Verifying what data is present before creating a formal template.

---

### Duplicate Detection

Go to the **Duplicates** tab to scan for files that contain the same data as other files.

Detection is based on the **Unique ID Fields** you configure per template (e.g. if two Commercial Invoices have the same Invoice Number, they are flagged as duplicates).

The panel shows:
- How many duplicate groups were found.
- Which files are involved and their current status.
- A **Delete** button to remove the unwanted copy directly from the results.

Click **Rescan** at any time to refresh the analysis.

> Duplicate detection only works for templates that have Unique ID Fields configured. Set these up in the Templates tab.

---

### Document Reconciliation

Go to the **Reconcile** tab to cross-check data across multiple related documents.

**Example use case:** Verify that the `Total Amount` on a Commercial Invoice matches the `Amount` on the corresponding Packing List and Bill of Lading.

**How to use:**
1. Tick two or more files from the list.
2. Click **Load Fields** to see all fields present across the selected files.
3. Choose a **Match Key Field** — a field like `BL Number` or `Reference ID` that links the documents together.
4. Tick one or more **Compare Fields** — the values you want to check for consistency.
5. Click **Run Reconciliation**.

Results show each group of documents that share the same match key, with a row-by-row field comparison. Mismatches are highlighted in amber.

---

### Approval Routing & Pending Approvals

Configured in the **Workflow** tab under **Approval Routing**.

When a file is moved to a routed stage:
- It is automatically assigned to the configured approver.
- The escalation timer starts.
- Once the escalation window expires, the file appears as **Overdue** in the Pending Approvals table.

The Pending Approvals table (at the bottom of the Workflow tab) shows every file currently awaiting action, along with how long it has been waiting and whether it is overdue.

---

### In-App Notifications

The **bell icon** in the top-right header shows live alerts. It checks for:
- **Overdue approvals** — files that have exceeded their escalation window (red).
- **Duplicate groups** — newly detected duplicate documents (amber).
- **Rule triggers** — automation rules that fired during extraction in the last 24 hours (amber).

The badge count updates every 60 seconds. Click the bell to see a full list with timestamps.

---

## Audit Log

Go to the **Audit Log** tab to see a complete history of every action taken on the platform.

**What is logged:**
- File uploads, extractions, and deletions
- Field edits (old and new values)
- Status changes
- Assignments and auto-assignments
- Rule triggers
- Bulk operations

**Filtering:**
Use the search bar and dropdowns to filter by action type or entity type (file, template, rule, etc.).

Click any row to expand the full details of that event.

---

## Analytics

Go to the **Analytics** tab for a live dashboard of platform activity.

**Metrics shown:**
- Total files and extraction rate
- Approved vs rejected count
- Active automation rules
- Extractions and status changes over the last 7 days (bar charts)
- Top templates by usage
- Most common audit actions
- Average time from upload to first extraction
- Today's event count vs. total
- Overall approval rate

Click **Refresh** to update all figures.

---

## Tips

- **Start with templates.** Define your document types first so extraction is consistent and duplicate detection works correctly.
- **Use Smart Extract for new document types** before committing to a template — it shows you what fields are present.
- **Set Unique ID Fields** on every template to get full value from duplicate detection.
- **Configure Approval Routing** before files start flowing — the system auto-assigns as soon as files hit a routed stage.
- **Use the Reconcile tab** before approving a shipment to catch discrepancies between related documents.
- **Check the Notification Bell regularly** — overdue approvals and duplicate flags appear there first.
