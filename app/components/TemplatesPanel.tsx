"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  updateTemplate,
  detectDocType,
  extractTemplateData,
  groupDocuments,
  refineExtraction,
  copyTemplateFrom,
  addTemplateComment,
  getLibraries,
  uploadPdf,
} from "@/lib/api";
import { PdfPageViewer } from "@/components/PdfPageViewer";
import FileUploadZone from "@/components/FileUploadZone";
import type {
  Template,
  FieldConfig,
  LibraryDerived,
  TemplateComment,
  UploadResult,
  DetectedPage,
  ExtractionResult,
  ExtractedPage,
  DocumentGroup,
} from "@/lib/api";

const _docGroupCache = new Map<string, DocumentGroup[]>();

function isInvoiceType(templateType: string) {
  return templateType.toLowerCase().includes("invoice");
}

// ─── Simple tag input (for table fields / conditions) ─────────────────────

function TagInput({
  label,
  placeholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none"
        />
        <button type="button" onClick={add} disabled={!draft.trim()}
          className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-40">
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
              {item}
              <button type="button" onClick={() => onChange(items.filter((i) => i !== item))}
                className="text-blue-400 hover:text-blue-700 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fields with per-field synonyms ───────────────────────────────────────

interface FieldEntry {
  name: string;
  synonyms: string[];
}

function FieldsWithSynonyms({
  entries,
  onChange,
}: {
  entries: FieldEntry[];
  onChange: (entries: FieldEntry[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDraft, setBulkDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [synDrafts, setSynDrafts] = useState<Record<number, string>>({});

  const addField = () => {
    const v = draft.trim();
    if (v && !entries.find((e) => e.name === v)) onChange([...entries, { name: v, synonyms: [] }]);
    setDraft("");
  };

  const addBulkFields = (raw: string) => {
    const names = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const existing = new Set(entries.map((e) => e.name));
    const newEntries = names
      .filter((n) => !existing.has(n))
      .map((n) => ({ name: n, synonyms: [] }));
    if (newEntries.length) onChange([...entries, ...newEntries]);
    setDraft("");
    setBulkMode(false);
    setBulkDraft("");
  };

  const removeField = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
    setExpanded((prev) => { const n = new Set(prev); n.delete(idx); return n; });
  };

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  };

  const addSynonym = (fieldIdx: number) => {
    const v = (synDrafts[fieldIdx] || "").trim();
    if (!v) return;
    const entry = entries[fieldIdx];
    if (!entry.synonyms.includes(v)) {
      onChange(entries.map((e, i) => i === fieldIdx ? { ...e, synonyms: [...e.synonyms, v] } : e));
    }
    setSynDrafts((prev) => ({ ...prev, [fieldIdx]: "" }));
  };

  const removeSynonym = (fieldIdx: number, synIdx: number) => {
    onChange(entries.map((e, i) =>
      i === fieldIdx ? { ...e, synonyms: e.synonyms.filter((_, si) => si !== synIdx) } : e
    ));
  };

  return (
    <div className="space-y-2">
      {/* mode toggle */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">Fields</span>
        <button type="button" onClick={() => { setBulkMode((v) => !v); setBulkDraft(""); setDraft(""); }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          {bulkMode ? "← Single add" : "Paste list"}
        </button>
      </div>

      {bulkMode ? (
        <div className="space-y-2">
          <textarea
            value={bulkDraft}
            onChange={(e) => setBulkDraft(e.target.value)}
            placeholder={"Paste fields separated by commas or newlines:\nInvoice Number, Invoice Date, HBL Number,\nGrand Total, CBM"}
            rows={5}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none resize-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => addBulkFields(bulkDraft)} disabled={!bulkDraft.trim()}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              Add All
            </button>
            <button type="button" onClick={() => { setBulkMode(false); setBulkDraft(""); }}
              className="text-sm text-gray-500 border rounded-lg px-4 py-1.5 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }}
            placeholder="e.g. Invoice Number"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none"
          />
          <button type="button" onClick={addField} disabled={!draft.trim()}
            className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-40">
            Add
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {entries.map((entry, fieldIdx) => (
          <div key={fieldIdx} className="border rounded-lg bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm font-medium text-gray-800">{entry.name}</span>
              <button type="button" onClick={() => toggleExpand(fieldIdx)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">
                {expanded.has(fieldIdx) ? "Hide synonyms" : `Synonyms${entry.synonyms.length > 0 ? ` (${entry.synonyms.length})` : ""}`}
              </button>
              <button type="button" onClick={() => removeField(fieldIdx)}
                className="text-gray-300 hover:text-red-500 text-lg leading-none ml-1">×</button>
            </div>

            {expanded.has(fieldIdx) && (
              <div className="border-t px-3 py-2 bg-gray-50 space-y-2">
                <p className="text-xs text-gray-500">Alternative labels Claude will accept for this field (e.g. Invoice #, Inv No)</p>
                {entry.synonyms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.synonyms.map((syn, synIdx) => (
                      <span key={synIdx} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {syn}
                        <button type="button" onClick={() => removeSynonym(fieldIdx, synIdx)}
                          className="text-blue-400 hover:text-blue-700 leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={synDrafts[fieldIdx] || ""}
                    onChange={(e) => setSynDrafts((prev) => ({ ...prev, [fieldIdx]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSynonym(fieldIdx); } }}
                    placeholder="Add synonym and press Enter"
                    className="flex-1 border rounded px-2 py-1.5 text-xs focus:ring-2 ring-blue-300 outline-none"
                  />
                  <button type="button" onClick={() => addSynonym(fieldIdx)}
                    disabled={!(synDrafts[fieldIdx] || "").trim()}
                    className="bg-blue-100 text-blue-700 px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-200 disabled:opacity-40">
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Template create form ─────────────────────────────────────────────────

type View = "list" | "create" | "review" | "configure";

function CreateForm({ onSaved, onCancel }: { onSaved: (t: Template) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [fieldEntries, setFieldEntries] = useState<FieldEntry[]>([]);
  const [uniqueIdField, setUniqueIdField] = useState("");
  const [tableFields, setTableFields] = useState<string[]>([]);
  const [specialConditions, setSpecialConditions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !templateType.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createTemplate({
      name: name.trim(),
      template_type: templateType.trim(),
      direct_link_fields: fieldEntries.map((e) => e.name),
      field_synonyms: Object.fromEntries(
        fieldEntries.filter((e) => e.synonyms.length > 0).map((e) => [e.name, e.synonyms])
      ),
      table_fields: tableFields,
      special_conditions: specialConditions,
      unique_id_fields: uniqueIdField ? [uniqueIdField] : [],
    });
    setSaving(false);
    if (res.success && res.data) { onSaved(res.data); }
    else { setError(res.error || "Failed to save template"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">New Template</h3>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">1 — Declare</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Template Name</label>
            <input placeholder="e.g. My Invoice Template" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Document Type</label>
            <input placeholder="e.g. Invoice, DO, Shipment" value={templateType} onChange={(e) => setTemplateType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none" />
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">2 — Direct Link Fields</p>
        <p className="text-xs text-gray-500 mb-3">
          Fields to extract (e.g. Invoice ID). Click <strong>Synonyms</strong> on any field to add alternative labels Claude will match.
        </p>
        <FieldsWithSynonyms entries={fieldEntries} onChange={setFieldEntries} />
      </div>

      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">3 — Unique ID Field</p>
        <p className="text-xs text-gray-500 mb-3">
          Which field uniquely identifies one document (e.g. Invoice Number, Bill of Lading No)? Used to detect duplicate uploads on the Duplicates screen — leave blank to skip duplicate detection for this template.
        </p>
        <select value={uniqueIdField} onChange={(e) => setUniqueIdField(e.target.value)}
          disabled={fieldEntries.length === 0}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none bg-white disabled:opacity-50">
          <option value="">— None (no duplicate detection) —</option>
          {fieldEntries.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
      </div>

      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">4 — Table Columns</p>
        <p className="text-xs text-gray-500 mb-3">Column names in the document's table (e.g. item, price, qty).</p>
        <TagInput label="" placeholder="e.g. item" items={tableFields} onChange={setTableFields} />
      </div>

      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">5 — Special Conditions</p>
        <p className="text-xs text-gray-500 mb-3">Conditional rules applied during extraction (e.g. if item contains wine then danger=1).</p>
        <TagInput label="" placeholder="e.g. if item contains wine then danger=1" items={specialConditions} onChange={setSpecialConditions} />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button onClick={handleSave} disabled={saving || !name.trim() || !templateType.trim()}
        className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {saving ? "Saving..." : "Save Template"}
      </button>
    </div>
  );
}

// ─── Review page card ─────────────────────────────────────────────────────

function ReviewPageCard({
  page,
  pageIdx,
  fileId,
  activeField,
  fieldConfig,
  onUpdateField,
  onUpdateTableCell,
  onFieldClick,
  onAddField,
  onDeleteField,
}: {
  page: ExtractedPage;
  pageIdx: number;
  fileId: string;
  activeField: string | null;
  fieldConfig?: Record<string, FieldConfig>;
  onUpdateField: (pageIdx: number, key: string, value: string) => void;
  onUpdateTableCell: (pageIdx: number, rowIdx: number, col: string, value: string) => void;
  onFieldClick: (fieldName: string | null) => void;
  onAddField: (pageIdx: number, key: string, value: string) => void;
  onDeleteField: (pageIdx: number, key: string) => void;
}) {
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [addingField, setAddingField] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const toggleHidden = (key: string) =>
    setHiddenFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const commitAddField = () => {
    const k = newKey.trim();
    if (!k) return;
    onAddField(pageIdx, k, newValue);
    setNewKey("");
    setNewValue("");
    setAddingField(false);
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Page {page.page_number}</span>
        <div className="flex items-center gap-2">
          {activeField && (
            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              Highlighting: {activeField}
            </span>
          )}
          {page.applied_conditions.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
              ⚠ {page.applied_conditions.length} condition{page.applied_conditions.length !== 1 ? "s" : ""} triggered
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x" style={{ minHeight: "380px" }}>
        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "600px" }}>
          {Object.keys(page.fields).length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fields</p>
                <p className="text-xs text-gray-400">Click label to highlight · Values are editable</p>
              </div>
              {Object.entries(page.fields).map(([key, val]) => {
                const hasPosition = !!page.field_positions?.[key];
                const isActive = activeField === key;
                const isHidden = hiddenFields.has(key);
                const cfg = fieldConfig?.[key];
                return (
                  <div key={key} className={`group rounded-lg px-2 py-1.5 transition-colors ${isActive ? "bg-yellow-50 ring-1 ring-yellow-300" : "hover:bg-gray-50"}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {/* Label / highlight toggle */}
                      <button type="button"
                        onClick={() => hasPosition && onFieldClick(activeField === key ? null : key)}
                        className={`text-xs flex-1 text-left font-semibold leading-tight truncate ${hasPosition ? "cursor-pointer text-blue-600 hover:text-blue-800" : "cursor-default text-gray-600"} ${isActive ? "text-yellow-700" : ""}`}
                        title={hasPosition ? "Click to highlight in document" : "No position data"}>
                        {key}{hasPosition && <span className="ml-1 opacity-50">⌖</span>}
                      </button>
                      {/* Action icons */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Eye — toggle visibility */}
                        <button onClick={() => toggleHidden(key)}
                          title={isHidden ? "Show value" : "Collapse value"}
                          className="p-0.5 text-gray-400 hover:text-blue-600 transition-colors rounded">
                          {isHidden ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          )}
                        </button>
                        {/* Info — field description */}
                        {cfg?.description && (
                          <button title={`${cfg.data_type}${cfg.description ? ` · ${cfg.description}` : ""}${cfg.data_type_restriction ? `\nRule: ${cfg.data_type_restriction}` : ""}`}
                            className="p-0.5 text-gray-400 hover:text-indigo-600 transition-colors rounded">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" /></svg>
                          </button>
                        )}
                        {/* Delete — remove field */}
                        <button onClick={() => onDeleteField(pageIdx, key)}
                          title="Remove field"
                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors rounded">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    {/* Value */}
                    {isHidden ? (
                      <p className="text-xs text-gray-500 italic truncate px-0.5">{val || <span className="text-gray-300">empty</span>}</p>
                    ) : (
                      <textarea value={val ?? ""} onChange={(e) => onUpdateField(pageIdx, key, e.target.value)}
                        rows={2}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:ring-2 ring-blue-300 outline-none bg-white resize-y min-h-[2.5rem]" />
                    )}
                  </div>
                );
              })}

              {/* ADD ATTRIBUTE */}
              {addingField ? (
                <div className="border border-dashed border-blue-300 rounded-lg px-3 py-2.5 space-y-2 bg-blue-50/40">
                  <input autoFocus type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Field name…"
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white outline-none focus:ring-1 ring-blue-400" />
                  <textarea value={newValue} onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Value…" rows={2}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white outline-none focus:ring-1 ring-blue-400 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={commitAddField}
                      className="flex-1 text-xs bg-blue-600 text-white rounded-lg py-1.5 font-medium hover:bg-blue-700 transition-colors">
                      Add
                    </button>
                    <button onClick={() => { setAddingField(false); setNewKey(""); setNewValue(""); }}
                      className="flex-1 text-xs border border-gray-200 text-gray-500 rounded-lg py-1.5 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingField(true)}
                  className="w-full mt-1 flex items-center gap-1.5 text-xs text-blue-600 border border-dashed border-blue-300 rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  ADD ATTRIBUTE
                </button>
              )}
            </div>
          )}

          {page.table_rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Table</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(page.table_rows[0]).map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 border-b">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.table_rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b last:border-0">
                        {Object.entries(row).map(([col, cell]) => (
                          <td key={col} className="px-1 py-1">
                            <textarea value={cell ?? ""} onChange={(e) => onUpdateTableCell(pageIdx, rowIdx, col, e.target.value)}
                              rows={2} className="w-full px-2 py-1 text-xs text-gray-900 border rounded focus:ring-2 ring-blue-300 outline-none bg-white resize-y min-h-[2rem]" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page.applied_conditions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">Conditions Applied</p>
              {page.applied_conditions.map((c, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠ {c}</p>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "600px" }}>
          <PdfPageViewer
            fileId={fileId} pageNumber={page.page_number} activeField={activeField}
            fieldPositions={page.field_positions ?? {}} pageWidth={page.page_width} pageHeight={page.page_height}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Refine with AI modal ─────────────────────────────────────────────────

function RefineWithAIModal({
  pages,
  fileId,
  templateId,
  onApply,
  onClose,
}: {
  pages: ExtractedPage[];
  fileId: string;
  templateId: string;
  onApply: (
    pageNumber: number,
    fields: Record<string, string | null>,
    tableRows: Record<string, string>[],
    newFields: string[]
  ) => void;
  onClose: () => void;
}) {
  const [selectedPageNum, setSelectedPageNum] = useState(pages[0]?.page_number ?? 1);
  const [mode, setMode] = useState<"headers" | "table">("headers");
  const [instructions, setInstructions] = useState("");
  const [newFieldInput, setNewFieldInput] = useState("");
  const [newFieldsList, setNewFieldsList] = useState<string[]>([]);
  const [saveToTemplate, setSaveToTemplate] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{
    fields?: Record<string, string | null>;
    table_rows?: Record<string, string>[];
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selectedPage = pages.find((p) => p.page_number === selectedPageNum) ?? pages[0];
  const hasTableData = (selectedPage?.table_rows?.length ?? 0) > 0;
  const existingFieldNames = Object.keys(selectedPage?.fields ?? {});

  const addNewField = (raw: string) => {
    const names = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    setNewFieldsList((prev) => {
      const existing = new Set(prev);
      return [...prev, ...names.filter((n) => !existing.has(n))];
    });
    setNewFieldInput("");
  };

  const removeNewField = (name: string) => setNewFieldsList((prev) => prev.filter((f) => f !== name));

  const handlePreview = async () => {
    if (!selectedPage || (!instructions.trim() && newFieldsList.length === 0)) return;
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);

    let fullInstructions = instructions.trim();
    if (newFieldsList.length > 0) {
      const fieldList = newFieldsList.join(", ");
      fullInstructions = fullInstructions
        ? `${fullInstructions}\n\nAlso extract these new fields not currently in the template: ${fieldList}`
        : `Extract the following new fields from this document: ${fieldList}`;
    }

    const res = await refineExtraction({
      template_id: templateId,
      file_id: fileId,
      page_number: selectedPageNum,
      current_fields: mode === "headers" ? selectedPage.fields : {},
      current_table_rows: mode === "table" ? selectedPage.table_rows : [],
      instructions: fullInstructions,
      mode,
    });
    setPreviewing(false);
    if (res.success && res.data) { setPreview(res.data); }
    else { setPreviewError(res.error || "Refinement failed"); }
  };

  const detectedNewFields = preview?.fields
    ? Object.keys(preview.fields).filter((k) => !existingFieldNames.includes(k))
    : [];

  const needsPreview = (newFieldsList.length > 0 || instructions.trim().length > 0) && !preview;

  const handleApply = () => {
    if (!selectedPage) return;
    const fields = preview?.fields ?? selectedPage.fields;
    const tableRows = preview?.table_rows ?? selectedPage.table_rows;
    const combined = [...newFieldsList, ...detectedNewFields];
    const toSave = saveToTemplate ? combined.filter((f, i) => combined.indexOf(f) === i) : [];
    onApply(
      selectedPageNum,
      fields as Record<string, string | null>,
      tableRows as Record<string, string>[],
      toSave
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h2 className="font-semibold text-gray-900 text-lg">Refine with AI</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6 min-h-0">
          {/* Left: controls */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Select Page</label>
                <select value={selectedPageNum}
                  onChange={(e) => { setSelectedPageNum(Number(e.target.value)); setPreview(null); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none bg-white">
                  {pages.map((p) => (
                    <option key={p.page_number} value={p.page_number}>Page {p.page_number}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Mode</label>
                <div className="flex border rounded-lg overflow-hidden">
                  <button type="button" onClick={() => { setMode("headers"); setPreview(null); }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "headers" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    Headers
                  </button>
                  {hasTableData && (
                    <button type="button" onClick={() => { setMode("table"); setPreview(null); }}
                      className={`flex-1 py-2 text-sm font-medium transition-colors border-l ${mode === "table" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                      Table
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Refinement Instructions</label>
              <p className="text-xs text-gray-500">Describe what needs to be corrected. Be specific about field names and values.</p>
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <strong>Tip:</strong> If the same field exists in multiple sections, specify the section name (e.g. "Update Total Amount in the Invoice section").
              </div>
              <textarea value={instructions}
                onChange={(e) => { setInstructions(e.target.value); setPreview(null); }}
                placeholder={
                  mode === "headers"
                    ? 'e.g. "The GST field should equal to GST TOTAL Amount (number)"'
                    : 'e.g. "The HBL No field should equal the BL number in the description. The Charge Code should be TPT."'
                }
                rows={7}
                className="w-full border rounded-xl px-3 py-3 text-sm focus:ring-2 ring-blue-300 outline-none resize-y" />
            </div>

            {/* New fields to add */}
            <div className="space-y-2 border border-dashed border-blue-200 rounded-xl p-3 bg-blue-50/40">
              <label className="text-sm font-semibold text-gray-700">Add New Fields to Template</label>
              <p className="text-xs text-gray-500">Fields that don't exist yet — AI will extract them and optionally save them to the template.</p>
              <div className="flex gap-2">
                <input type="text" value={newFieldInput}
                  onChange={(e) => setNewFieldInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNewField(newFieldInput))}
                  placeholder="e.g. Vessel Name, HS Code (comma separated)"
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 ring-blue-300 outline-none bg-white" />
                <button type="button" onClick={() => addNewField(newFieldInput)} disabled={!newFieldInput.trim()}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                  Add
                </button>
              </div>
              {newFieldsList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {newFieldsList.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                      + {f}
                      <button onClick={() => removeNewField(f)} className="text-blue-400 hover:text-blue-700 ml-0.5">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              {newFieldsList.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input type="checkbox" checked={saveToTemplate} onChange={(e) => setSaveToTemplate(e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-600" />
                  <span className="text-xs text-gray-600">Save new fields to template after applying</span>
                </label>
              )}
            </div>

            <button onClick={handlePreview} disabled={previewing || (!instructions.trim() && newFieldsList.length === 0)}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {previewing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Refining with AI…
                </>
              ) : "Preview Changes"}
            </button>

            {previewError && <p className="text-red-600 text-sm">{previewError}</p>}
          </div>

          {/* Right: preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm font-semibold text-gray-700">Extracted Data Preview</span>
            </div>

            {/* Legend */}
            {preview && detectedNewFields.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" /> Updated</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 inline-block" /> New field</span>
              </div>
            )}

            {!preview ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                <p className="text-sm text-blue-600 font-medium">Click "Preview Changes" to see the updated extraction data</p>
              </div>
            ) : mode === "headers" && preview.fields ? (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Field</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(preview.fields).map(([key, val]) => {
                      const isNew = !existingFieldNames.includes(key);
                      const original = selectedPage?.fields[key];
                      const changed = !isNew && val !== original;
                      return (
                        <tr key={key} className={`border-b last:border-0 ${isNew ? "bg-blue-50" : changed ? "bg-green-50" : ""}`}>
                          <td className="px-3 py-2 text-xs font-medium text-gray-600">
                            {isNew && <span className="text-[10px] text-blue-600 font-bold mr-1 uppercase">New</span>}
                            {key}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900">
                            {changed && <span className="text-[10px] text-green-600 font-bold mr-1 uppercase">Updated</span>}
                            {val ?? <span className="text-gray-400 italic">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : mode === "table" && preview.table_rows ? (
              <div className="border rounded-xl overflow-auto">
                {preview.table_rows.length === 0 ? (
                  <p className="text-xs text-gray-400 p-4 text-center italic">No rows returned</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {Object.keys(preview.table_rows[0]).map((col) => (
                          <th key={col} className="px-2 py-2 text-left font-semibold text-gray-600 border-r last:border-0">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.table_rows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 text-gray-900 border-r last:border-0">{val ?? "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          {needsPreview && (
            <p className="text-xs text-amber-600 mr-auto flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
              Click &ldquo;Preview Changes&rdquo; first to extract the new fields
            </p>
          )}
          <button onClick={handleApply} disabled={needsPreview || (!preview && newFieldsList.length === 0)}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {saveToTemplate && (detectedNewFields.length > 0 || newFieldsList.length > 0)
              ? "Apply & Save to Template"
              : "Apply & Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review panel ─────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "approved" | "for_review" | "rejected";

function ReviewPanel({
  result,
  fileId,
  docGroups,
  fieldConfig,
  onClose,
}: {
  result: ExtractionResult;
  fileId: string;
  docGroups: DocumentGroup[];
  fieldConfig?: Record<string, FieldConfig>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [editedPages, setEditedPages] = useState<ExtractedPage[]>(
    result.pages.map((p) => ({ ...p, fields: { ...p.fields } }))
  );
  const [activeField, setActiveField] = useState<{ pageIdx: number; fieldName: string } | null>(null);
  const [showRefine, setShowRefine] = useState(false);

  const updateField = (pageIdx: number, key: string, value: string) => {
    setEditedPages((prev) =>
      prev.map((p, i) => i === pageIdx ? { ...p, fields: { ...p.fields, [key]: value } } : p)
    );
  };

  const addField = (pageIdx: number, key: string, value: string) => {
    setEditedPages((prev) =>
      prev.map((p, i) => i === pageIdx ? { ...p, fields: { ...p.fields, [key]: value } } : p)
    );
  };

  const deleteField = (pageIdx: number, key: string) => {
    setEditedPages((prev) =>
      prev.map((p, i) => {
        if (i !== pageIdx) return p;
        const { [key]: _removed, ...rest } = p.fields;
        return { ...p, fields: rest };
      })
    );
  };

  const updateTableCell = (pageIdx: number, rowIdx: number, col: string, value: string) => {
    setEditedPages((prev) =>
      prev.map((p, i) =>
        i === pageIdx
          ? { ...p, table_rows: p.table_rows.map((row, ri) => ri === rowIdx ? { ...row, [col]: value } : row) }
          : p
      )
    );
  };

  const applyRefinement = async (
    pageNumber: number,
    fields: Record<string, string | null>,
    tableRows: Record<string, string>[],
    newFields: string[]
  ) => {
    setEditedPages((prev) =>
      prev.map((p) =>
        p.page_number === pageNumber
          ? { ...p, fields: fields as Record<string, string | null>, table_rows: tableRows }
          : p
      )
    );
    if (newFields.length > 0 && result.template_id) {
      const currentDirectFields = Object.keys(
        editedPages[0]?.fields ?? {}
      );
      const all = [...currentDirectFields, ...newFields];
      const merged = all.filter((f, i) => all.indexOf(f) === i);
      await updateTemplate(result.template_id, {
        // Persist new fields into direct_link_fields so they survive reload
        direct_link_fields: merged,
        field_config: Object.fromEntries(
          newFields.map((f) => [f, { description: "", required: false, data_type: "Text", data_type_restriction: "", synonyms: [], library_derived: null, doc_type_priority: null, display_doc_audit: true, add_separator_below: false }])
        ),
      });
      // Reflect the new fields in all pages so they show up in the review table
      setEditedPages((prev) =>
        prev.map((p) => ({
          ...p,
          fields: {
            ...Object.fromEntries(merged.map((f) => [f, p.fields[f] ?? null])),
            ...p.fields,
          },
        }))
      );
    }
  };

  const exportJson = () => {
    const data = {
      template: result.template_name,
      template_type: result.template_type,
      status,
      extracted_at: new Date().toISOString(),
      pages: editedPages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extracted_${result.template_type}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBannerMap: Partial<Record<ReviewStatus, { text: string; classes: string }>> = {
    approved: { text: "Approved", classes: "bg-green-50 border-green-200 text-green-700" },
    for_review: { text: "Flagged for Review", classes: "bg-amber-50 border-amber-200 text-amber-700" },
    rejected: { text: "Rejected", classes: "bg-red-50 border-red-200 text-red-700" },
  };
  const statusBanner = statusBannerMap[status];

  return (
    <>
      {showRefine && (
        <RefineWithAIModal
          pages={editedPages}
          fileId={fileId}
          templateId={result.template_id}
          onApply={applyRefinement}
          onClose={() => setShowRefine(false)}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Extracted Data — {result.template_type}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {result.pages.length} page{result.pages.length !== 1 ? "s" : ""} processed · Click a field to highlight its location
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRefine(true)}
              className="flex items-center gap-1.5 text-sm bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Refine with AI
            </button>
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
          </div>
        </div>

        {statusBanner && (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${statusBanner.classes}`}>
            {status === "approved" && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {status === "for_review" && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" /></svg>}
            {status === "rejected" && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
            {statusBanner.text}
          </div>
        )}

        {docGroups.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Document Breakdown</h4>
            <div className="space-y-1.5">
              {docGroups.map((doc) => (
                <div key={doc.document_number}
                  className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs ${doc.is_invoice ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {doc.is_invoice && <span className="font-bold text-amber-700 bg-amber-200 rounded px-1.5 py-0.5 uppercase tracking-wide text-[10px]">Invoice</span>}
                    <span className="font-semibold text-gray-700">{doc.document_type}</span>
                    {doc.reference && <span className="font-mono text-gray-500">#{doc.reference}</span>}
                    <span className="text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px]">
                      {doc.pages.length === 1 ? `p.${doc.pages[0]}` : `pp.${doc.pages[0]}–${doc.pages[doc.pages.length - 1]}`}
                    </span>
                  </div>
                  {doc.customer && <div><span className="text-gray-400 uppercase text-[10px] font-semibold">Customer </span><span className="font-medium text-gray-800">{doc.customer}</span></div>}
                  {doc.agent && <div><span className="text-gray-400 uppercase text-[10px] font-semibold">Agent </span><span className="font-medium text-gray-800">{doc.agent}</span></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {editedPages.map((page, pageIdx) => (
          <ReviewPageCard
            key={page.page_number}
            page={page} pageIdx={pageIdx} fileId={fileId}
            fieldConfig={fieldConfig}
            activeField={activeField?.pageIdx === pageIdx ? activeField.fieldName : null}
            onUpdateField={updateField} onUpdateTableCell={updateTableCell}
            onFieldClick={(fieldName) => setActiveField(fieldName ? { pageIdx, fieldName } : null)}
            onAddField={addField}
            onDeleteField={deleteField}
          />
        ))}

        {/* Status actions */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => setStatus("approved")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${status === "approved" ? "bg-blue-600 text-white border-blue-600" : "border-blue-600 text-blue-600 hover:bg-blue-50"}`}>
            Approve
          </button>
          <button onClick={() => setStatus("for_review")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${status === "for_review" ? "bg-amber-500 text-white border-amber-500" : "border-amber-400 text-amber-600 hover:bg-amber-50"}`}>
            For Review
          </button>
          <button onClick={() => setStatus("rejected")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${status === "rejected" ? "bg-red-500 text-white border-red-500" : "border-red-400 text-red-500 hover:bg-red-50"}`}>
            Reject
          </button>
          <button onClick={exportJson}
            className="px-4 py-2.5 border rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Export JSON
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Template card ────────────────────────────────────────────────────────

function TemplateCard({
  template,
  uploadResult,
  onDelete,
  onReview,
  onConfigure,
}: {
  template: Template;
  uploadResult?: UploadResult | null;
  onDelete: () => void;
  onReview: (result: ExtractionResult, fileId: string, docGroups: DocumentGroup[], fc?: Record<string, FieldConfig>) => void;
  onConfigure: (template: Template) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [detectedPages, setDetectedPages] = useState<DetectedPage[] | null>(null);
  const [relatedDocs, setRelatedDocs] = useState<DocumentGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const matchedPages = detectedPages
    ? detectedPages.filter((p) => p.template_id === template.id).map((p) => p.page_number)
    : [];

  const handleDetect = async () => {
    if (!uploadResult) return;
    setDetecting(true);
    setError(null);
    setDetectedPages(null);
    setRelatedDocs([]);

    const groupsPromise = _docGroupCache.has(uploadResult.file_id)
      ? Promise.resolve(_docGroupCache.get(uploadResult.file_id)!)
      : groupDocuments(uploadResult.file_id).then((gr) => {
          const docs = gr.success && gr.data ? gr.data.documents : [];
          _docGroupCache.set(uploadResult.file_id, docs);
          return docs;
        });

    const [detectRes, groups] = await Promise.all([
      detectDocType(uploadResult.file_id, [template.id]),
      groupsPromise,
    ]);

    setDetecting(false);

    if (!detectRes.success || !detectRes.data) {
      setError(detectRes.error || "Detection failed");
      return;
    }

    const matched = detectRes.data.pages.filter((p) => p.template_id === template.id).map((p) => p.page_number);
    setDetectedPages(detectRes.data.pages);
    setRelatedDocs(groups.filter((g) => g.pages.some((p) => matched.includes(p))));
  };

  const handleExtract = async () => {
    if (!uploadResult) return;
    setExtracting(true);
    setError(null);
    setProgress(0);

    const pageCount = matchedPages.length > 0 ? matchedPages.length : (uploadResult.page_count ?? 10);
    const estimatedMs = Math.max(pageCount * 5000, 8000);
    const tickMs = 250;
    const increment = 90 / (estimatedMs / tickMs);
    const stages = ["Sending to Claude…", "Extracting fields…", "Processing tables…", "Finalising…"];
    let tick = 0;

    progressTimer.current = setInterval(() => {
      tick++;
      setProgress((p) => p < 90 ? Math.min(p + increment, 90) : Math.min(p + 0.05, 99));
      const stageIdx = Math.min(Math.floor(tick / (estimatedMs / tickMs / stages.length)), stages.length - 1);
      setProgressStage(tick > estimatedMs / tickMs ? "Still working…" : stages[stageIdx]);
    }, tickMs);

    try {
      const res = await extractTemplateData(template.id, uploadResult.file_id, matchedPages.length > 0 ? matchedPages : undefined);
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(100);
      setProgressStage("Done!");

      setTimeout(() => {
        setExtracting(false);
        setProgress(0);
        setProgressStage("");
        if (res.success && res.data) {
          const cachedGroups = _docGroupCache.get(uploadResult.file_id) ?? [];
          const docsForReview = cachedGroups.filter((g) => g.pages.some((p) => matchedPages.includes(p)));
          onReview(res.data, uploadResult.file_id, docsForReview, template.field_config);
        } else {
          setError(res.error || "Extraction failed");
        }
      }, 500);
    } catch (err) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setExtracting(false);
      setProgress(0);
      setProgressStage("");
      setError(err instanceof Error ? err.message : "Extraction failed");
    }
  };

  const isInvoice = isInvoiceType(template.template_type);
  const fieldSynonyms = template.field_synonyms ?? {};

  return (
    <li className={`border rounded-xl bg-white overflow-hidden ${isInvoice ? "border-amber-300" : ""}`}>
      {isInvoice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Invoice Priority</span>
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-gray-900 truncate">{template.name}</p>
              <span className={`flex-shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${isInvoice ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-700"}`}>
                {template.template_type}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {template.direct_link_fields.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-400">Fields:</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {template.direct_link_fields.map((f) => {
                      const syns = fieldSynonyms[f] ?? [];
                      return (
                        <span key={f} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5"
                          title={syns.length > 0 ? `Synonyms: ${syns.join(", ")}` : undefined}>
                          {f}
                          {syns.length > 0 && (
                            <span className="text-[10px] text-blue-400 font-medium">+{syns.length}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {template.table_fields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400 mr-1">Table:</span>
                  {template.table_fields.map((f) => (
                    <span key={f} className="text-xs bg-green-50 text-green-600 rounded px-1.5 py-0.5">{f}</span>
                  ))}
                </div>
              )}
              {template.special_conditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400 mr-1">Rules:</span>
                  {template.special_conditions.map((c, i) => (
                    <span key={i} className="text-xs bg-amber-50 text-amber-600 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onConfigure(template)}
              className="text-gray-400 hover:text-blue-600 transition-colors p-0.5" title="Configure fields">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors p-0.5" title="Delete template">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {uploadResult && (
          <div className="flex gap-2">
            <button onClick={handleDetect} disabled={detecting}
              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-full font-medium disabled:opacity-60 transition-colors">
              {detecting ? "Detecting..." : "Detect in PDF"}
            </button>
            {detectedPages && (
              <button onClick={handleExtract} disabled={extracting}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full font-medium disabled:opacity-60 transition-colors">
                {extracting ? "Extracting..." : matchedPages.length > 0 ? `Extract ${matchedPages.length} page${matchedPages.length !== 1 ? "s" : ""}` : "Extract all pages"}
              </button>
            )}
          </div>
        )}

        {extracting && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{progressStage}</span>
              <span className="font-medium text-blue-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">
              {progress >= 90 ? "Claude is still working, please wait…" : `Estimated ${Math.max(1, Math.ceil((matchedPages.length > 0 ? matchedPages.length : (uploadResult?.page_count ?? 10)) * 5 * (1 - progress / 100)))}s remaining`}
            </p>
          </div>
        )}

        {error && <p className="text-red-600 text-xs">{error}</p>}

        {detectedPages && (
          <div className="space-y-2">
            <div className="text-xs rounded-lg bg-purple-50 border border-purple-100 px-3 py-2">
              {matchedPages.length > 0 ? (
                <span className="text-purple-700">Matched pages: <strong>{matchedPages.join(", ")}</strong></span>
              ) : (
                <span className="text-gray-500">No pages matched this template in the uploaded PDF.</span>
              )}
            </div>

            {relatedDocs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Document Context</p>
                {relatedDocs.map((doc) => (
                  <div key={doc.document_number}
                    className={`rounded-lg border px-3 py-2 space-y-1.5 text-xs ${doc.is_invoice ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {doc.is_invoice && <span className="font-bold text-amber-700 bg-amber-200 rounded px-1.5 py-0.5 uppercase tracking-wide text-[10px]">Invoice</span>}
                        <span className="font-semibold text-gray-700">{doc.document_type}</span>
                      </div>
                      <span className="flex-shrink-0 text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                        {doc.pages.length === 1 ? `p.${doc.pages[0]}` : `pp.${doc.pages[0]}–${doc.pages[doc.pages.length - 1]}`}
                      </span>
                    </div>
                    {doc.reference && <p className="font-mono text-gray-600"><span className="text-gray-400"># </span>{doc.reference}</p>}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Customer</p>
                        <p className="text-gray-700 font-medium truncate">{doc.customer ?? <span className="italic text-gray-400">—</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Agent</p>
                        <p className="text-gray-700 font-medium truncate">{doc.agent ?? <span className="italic text-gray-400">—</span>}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ─── File Config Panel ────────────────────────────────────────────────────

const DATA_TYPES: FieldConfig["data_type"][] = ["Text", "Date", "Number", "Currency", "Boolean"];

function emptyFieldConfig(): FieldConfig {
  return {
    description: "",
    required: false,
    data_type: "Text",
    data_type_restriction: "",
    synonyms: [],
    library_derived: null,
    doc_type_priority: null,
    display_doc_audit: true,
    add_separator_below: false,
  };
}

// ─── Library Derived modal ─────────────────────────────────────────────────

function LibraryDerivedModal({
  fieldName,
  current,
  allFieldNames,
  onSave,
  onClose,
}: {
  fieldName: string;
  current: LibraryDerived | null;
  allFieldNames: string[];
  onSave: (ld: LibraryDerived | null) => void;
  onClose: () => void;
}) {
  const [libraries, setLibraries] = useState<Array<{ id: string; name: string; columns: string[] }>>([]);
  const [libraryId, setLibraryId] = useState(current?.library_id ?? "");
  const [matchField, setMatchField] = useState(current?.match_field ?? "");
  const [returnField, setReturnField] = useState(current?.return_field ?? "");

  useEffect(() => {
    getLibraries().then((res) => { if (res.success && res.data) setLibraries(res.data); });
  }, []);

  const selectedLib = libraries.find((l) => l.id === libraryId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Library Derived — {fieldName}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Auto-fill this field by looking up a value from a Library.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Library</label>
            <select value={libraryId} onChange={(e) => { setLibraryId(e.target.value); setMatchField(""); setReturnField(""); }}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              <option value="">Select a library…</option>
              {libraries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Match on this extracted field</label>
            <select value={matchField} onChange={(e) => setMatchField(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              <option value="">Select field…</option>
              {allFieldNames.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              The extracted value of this field will be used to find a matching row in the library.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Return this library column</label>
            <select value={returnField} onChange={(e) => setReturnField(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              <option value="">Select column…</option>
              {(selectedLib?.columns ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              This column&apos;s value from the matched row will fill <strong>{fieldName}</strong>.
            </p>
          </div>
        </div>

        <div className="flex justify-between pt-1">
          <button onClick={() => { onSave(null); onClose(); }}
            className="text-xs text-red-500 hover:text-red-700 font-medium">
            Remove library link
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => {
                if (libraryId && matchField && returnField) {
                  onSave({ library_id: libraryId, match_field: matchField, return_field: returnField });
                }
                onClose();
              }}
              disabled={!libraryId || !matchField || !returnField}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Field config row (extended) ───────────────────────────────────────────

function FieldConfigRow({
  fieldName,
  config,
  allFieldNames,
  onChange,
  onDelete,
}: {
  fieldName: string;
  config: FieldConfig;
  allFieldNames: string[];
  onChange: (updated: FieldConfig) => void;
  onDelete?: () => void;
}) {
  const [synInput, setSynInput] = useState("");
  const [showLibModal, setShowLibModal] = useState(false);

  const addSynonym = () => {
    const v = synInput.trim();
    if (v && !config.synonyms.includes(v)) onChange({ ...config, synonyms: [...config.synonyms, v] });
    setSynInput("");
  };

  return (
    <>
      {config.add_separator_below && (
        <tr><td colSpan={10}><div className="border-b-2 border-gray-300 my-1" /></td></tr>
      )}
      <tr className="border-b border-gray-100 align-top hover:bg-gray-50/40">
        {/* Field name */}
        <td className="py-2.5 pr-3 text-xs font-semibold text-gray-800 whitespace-nowrap w-36 align-middle">
          <div className="flex items-center gap-1.5">
            <span>{fieldName}</span>
            {onDelete && (
              <button onClick={onDelete} title="Remove field"
                className="text-gray-300 hover:text-red-500 leading-none flex-shrink-0">&times;</button>
            )}
          </div>
        </td>

        {/* Description */}
        <td className="py-2 pr-2 min-w-[120px]">
          <input type="text" value={config.description} placeholder="Description…"
            onChange={(e) => onChange({ ...config, description: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 ring-blue-500 outline-none" />
        </td>

        {/* Required */}
        <td className="py-2 pr-2 w-8 text-center align-middle">
          <input type="checkbox" checked={config.required}
            onChange={(e) => onChange({ ...config, required: e.target.checked })}
            className="w-3.5 h-3.5 accent-blue-600" />
        </td>

        {/* Synonyms */}
        <td className="py-2 pr-2 min-w-[140px]">
          <div className="flex flex-wrap gap-1 mb-1">
            {config.synonyms.map((s) => (
              <span key={s} className="inline-flex items-center gap-0.5 text-[10px] bg-purple-50 text-purple-700 rounded-full px-2 py-0.5">
                {s}
                <button onClick={() => onChange({ ...config, synonyms: config.synonyms.filter((x) => x !== s) })}
                  className="ml-0.5 text-purple-400 hover:text-purple-700 leading-none">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input type="text" value={synInput} placeholder="Add synonym…"
              onChange={(e) => setSynInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSynonym())}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-0.5 focus:ring-1 ring-blue-500 outline-none min-w-0" />
            <button onClick={addSynonym} className="text-xs text-blue-600 hover:text-blue-800 px-1 font-medium">+</button>
          </div>
        </td>

        {/* Data Type */}
        <td className="py-2 pr-2 w-24">
          <select value={config.data_type}
            onChange={(e) => onChange({ ...config, data_type: e.target.value as FieldConfig["data_type"] })}
            className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:ring-1 ring-blue-500 outline-none">
            {DATA_TYPES.map((dt) => <option key={dt}>{dt}</option>)}
          </select>
        </td>

        {/* Data Type Restriction */}
        <td className="py-2 pr-2 min-w-[130px]">
          <input type="text" value={config.data_type_restriction} placeholder="e.g. ISO 8601, regex…"
            onChange={(e) => onChange({ ...config, data_type_restriction: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 ring-blue-500 outline-none" />
        </td>

        {/* Library Derived */}
        <td className="py-2 pr-2 w-28 text-center align-middle">
          {config.library_derived ? (
            <button onClick={() => setShowLibModal(true)}
              className="text-[10px] bg-green-100 text-green-700 rounded px-2 py-0.5 font-medium hover:bg-green-200 whitespace-nowrap">
              ✓ Library
            </button>
          ) : (
            <button onClick={() => setShowLibModal(true)}
              className="text-[10px] text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 whitespace-nowrap">
              Configure
            </button>
          )}
        </td>

        {/* Doc Type Priority */}
        <td className="py-2 pr-2 w-28">
          <input type="text" value={config.doc_type_priority ?? ""} placeholder="Doc type…"
            onChange={(e) => onChange({ ...config, doc_type_priority: e.target.value || null })}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 ring-blue-500 outline-none" />
        </td>

        {/* Display Doc Audit */}
        <td className="py-2 pr-2 w-12 text-center align-middle">
          <input type="checkbox" checked={config.display_doc_audit}
            onChange={(e) => onChange({ ...config, display_doc_audit: e.target.checked })}
            className="w-3.5 h-3.5 accent-blue-600" />
        </td>

        {/* Add Separator Below */}
        <td className="py-2 w-12 text-center align-middle">
          <input type="checkbox" checked={config.add_separator_below}
            onChange={(e) => onChange({ ...config, add_separator_below: e.target.checked })}
            className="w-3.5 h-3.5 accent-gray-500" />
        </td>
      </tr>

      {showLibModal && (
        <LibraryDerivedModal
          fieldName={fieldName}
          current={config.library_derived}
          allFieldNames={allFieldNames}
          onSave={(ld) => onChange({ ...config, library_derived: ld })}
          onClose={() => setShowLibModal(false)}
        />
      )}
    </>
  );
}

function FileConfigPanel({
  template,
  allTemplates,
  onSaved,
  onCancel,
}: {
  template: Template;
  allTemplates: Template[];
  onSaved: (updated: Template) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<"headers" | "tables" | "ids" | "refid">("headers");

  // ── field lists (which fields exist at all — separate from their config) ─
  const [headerFields, setHeaderFields] = useState<string[]>(template.direct_link_fields);
  const [tableFieldsList, setTableFieldsList] = useState<string[]>(template.table_fields);
  const [newHeaderField, setNewHeaderField] = useState("");
  const [newTableField, setNewTableField] = useState("");

  const addHeaderField = () => {
    const name = newHeaderField.trim();
    if (!name || headerFields.includes(name)) return;
    setHeaderFields((prev) => [...prev, name]);
    setFieldConfig((prev) => ({ ...prev, [name]: emptyFieldConfig() }));
    setNewHeaderField("");
  };
  const removeHeaderField = (name: string) => {
    setHeaderFields((prev) => prev.filter((f) => f !== name));
    setFieldConfig((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };
  const addTableField = () => {
    const name = newTableField.trim();
    if (!name || tableFieldsList.includes(name)) return;
    setTableFieldsList((prev) => [...prev, name]);
    setTableConfig((prev) => ({ ...prev, [name]: emptyFieldConfig() }));
    setNewTableField("");
  };
  const removeTableField = (name: string) => {
    setTableFieldsList((prev) => prev.filter((f) => f !== name));
    setTableConfig((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // ── field configs ──────────────────────────────────────────────────────
  const [fieldConfig, setFieldConfig] = useState<Record<string, FieldConfig>>(() => {
    const fc: Record<string, FieldConfig> = {};
    for (const f of template.direct_link_fields) {
      const saved = template.field_config?.[f];
      fc[f] = saved
        ? { ...emptyFieldConfig(), ...saved }
        : { ...emptyFieldConfig(), synonyms: template.field_synonyms?.[f] ?? [] };
    }
    return fc;
  });
  const [tableConfig, setTableConfig] = useState<Record<string, FieldConfig>>(() => {
    const tc: Record<string, FieldConfig> = {};
    for (const f of template.table_fields) {
      const saved = template.table_config?.[f];
      tc[f] = saved ? { ...emptyFieldConfig(), ...saved } : emptyFieldConfig();
    }
    return tc;
  });

  // ── id fields ──────────────────────────────────────────────────────────
  const [uniqueIdFields, setUniqueIdFields] = useState<string[]>(template.unique_id_fields ?? []);
  const [secondaryIdFields, setSecondaryIdFields] = useState<string[]>(template.secondary_id_fields ?? []);
  const [referenceIdFields, setReferenceIdFields] = useState<string[]>(template.reference_id_fields ?? []);

  // ── template-level settings ────────────────────────────────────────────
  const [editableInFile, setEditableInFile] = useState<boolean>(template.editable_in_file ?? true);
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [copyFromId, setCopyFromId] = useState("");
  const [copyingFrom, setCopyingFrom] = useState(false);

  // ── comments ──────────────────────────────────────────────────────────
  const [comments, setComments] = useState<TemplateComment[]>(template.comments ?? []);
  const [commentText, setCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFields = [...headerFields, ...tableFieldsList];
  const allFieldNames = allFields;

  // ── save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateTemplate(template.id, {
      direct_link_fields: headerFields,
      table_fields: tableFieldsList,
      field_config: fieldConfig,
      table_config: tableConfig,
      unique_id_fields: uniqueIdFields,
      secondary_id_fields: secondaryIdFields,
      reference_id_fields: referenceIdFields,
      editable_in_file: editableInFile,
    });
    setSaving(false);
    if (res.success && res.data) {
      onSaved(res.data);
    } else {
      setError(res.error ?? "Save failed");
    }
  };

  // ── copy-from ─────────────────────────────────────────────────────────
  const handleCopyFrom = async () => {
    if (!copyFromId) return;
    setCopyingFrom(true);
    const res = await copyTemplateFrom(template.id, copyFromId);
    setCopyingFrom(false);
    if (res.success && res.data) {
      const updated = res.data as Template;
      const fc: Record<string, FieldConfig> = {};
      for (const f of headerFields) {
        const saved = updated.field_config?.[f];
        fc[f] = saved ? { ...emptyFieldConfig(), ...saved } : emptyFieldConfig();
      }
      setFieldConfig(fc);
      const tc: Record<string, FieldConfig> = {};
      for (const f of tableFieldsList) {
        const saved = updated.table_config?.[f];
        tc[f] = saved ? { ...emptyFieldConfig(), ...saved } : emptyFieldConfig();
      }
      setTableConfig(tc);
      setShowCopyFrom(false);
      setCopyFromId("");
    }
  };

  // ── add comment ───────────────────────────────────────────────────────
  const handleAddComment = async () => {
    const txt = commentText.trim();
    if (!txt) return;
    setAddingComment(true);
    const res = await addTemplateComment(template.id, txt);
    setAddingComment(false);
    if (res.success && res.data) {
      setComments((prev) => [res.data as TemplateComment, ...prev]);
      setCommentText("");
    }
  };

  // ── table header (all 10 columns) ─────────────────────────────────────
  const tableHeader = (
    <tr className="text-left text-[10px] text-gray-500 border-b border-gray-200 uppercase tracking-wide">
      <th className="pb-2 pr-3 font-semibold">Field</th>
      <th className="pb-2 pr-2 font-semibold min-w-[110px]">Description</th>
      <th className="pb-2 pr-2 font-semibold">Req</th>
      <th className="pb-2 pr-2 font-semibold min-w-[130px]">Synonyms</th>
      <th className="pb-2 pr-2 font-semibold">Data Type</th>
      <th className="pb-2 pr-2 font-semibold min-w-[120px]">Restriction</th>
      <th className="pb-2 pr-2 font-semibold">Library Derived</th>
      <th className="pb-2 pr-2 font-semibold">Doc Type Order</th>
      <th className="pb-2 pr-2 font-semibold">Audit</th>
      <th className="pb-2 font-semibold">Separator</th>
    </tr>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">Configure: {template.name}</h3>
          <p className="text-xs text-gray-400">{template.template_type}</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="ml-auto text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {/* Template-level settings bar */}
      <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 mb-3 text-xs">
        {/* Editable in File toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-gray-600 font-medium">Editable in File</span>
          <div
            onClick={() => setEditableInFile((v) => !v)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${editableInFile ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editableInFile ? "translate-x-4" : ""}`} />
          </div>
        </label>

        <div className="w-px h-4 bg-gray-300" />

        {/* Copy Data From */}
        {showCopyFrom ? (
          <div className="flex items-center gap-2">
            <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs bg-white outline-none focus:ring-1 ring-blue-400 min-w-[160px]">
              <option value="">Select source template…</option>
              {allTemplates.filter((t) => t.id !== template.id).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button onClick={handleCopyFrom} disabled={!copyFromId || copyingFrom}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {copyingFrom ? "Copying…" : "Copy"}
            </button>
            <button onClick={() => { setShowCopyFrom(false); setCopyFromId(""); }}
              className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowCopyFrom(true)}
            className="flex items-center gap-1 text-gray-600 hover:text-blue-600 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Data From
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-4">
        {(["headers", "tables", "ids", "refid"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t === "headers" ? "Headers" : t === "tables" ? "Tables" : t === "ids" ? "Unique ID" : "Reference ID"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === "headers" && (
          <div className="space-y-3">
            {headerFields.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No header fields defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>{tableHeader}</thead>
                  <tbody>
                    {headerFields.map((f) => (
                      <FieldConfigRow key={f} fieldName={f} config={fieldConfig[f]} allFieldNames={allFieldNames}
                        onChange={(updated) => setFieldConfig((prev) => ({ ...prev, [f]: updated }))}
                        onDelete={() => removeHeaderField(f)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newHeaderField} placeholder="New field name…"
                onChange={(e) => setNewHeaderField(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHeaderField())}
                className="flex-1 max-w-xs text-xs border border-gray-200 rounded px-2 py-1.5 focus:ring-1 ring-blue-500 outline-none" />
              <button onClick={addHeaderField} disabled={!newHeaderField.trim()}
                className="text-xs text-blue-600 border border-dashed border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 transition-colors">
                + Add Field
              </button>
            </div>
          </div>
        )}

        {tab === "tables" && (
          <div className="space-y-3">
            {tableFieldsList.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No table columns defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>{tableHeader}</thead>
                  <tbody>
                    {tableFieldsList.map((f) => (
                      <FieldConfigRow key={f} fieldName={f} config={tableConfig[f]} allFieldNames={allFieldNames}
                        onChange={(updated) => setTableConfig((prev) => ({ ...prev, [f]: updated }))}
                        onDelete={() => removeTableField(f)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newTableField} placeholder="New column name…"
                onChange={(e) => setNewTableField(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTableField())}
                className="flex-1 max-w-xs text-xs border border-gray-200 rounded px-2 py-1.5 focus:ring-1 ring-blue-500 outline-none" />
              <button onClick={addTableField} disabled={!newTableField.trim()}
                className="text-xs text-blue-600 border border-dashed border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 transition-colors">
                + Add Field
              </button>
            </div>
          </div>
        )}

        {tab === "ids" && (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Primary / Unique ID Fields</h4>
              <p className="text-xs text-gray-400 mb-3">These fields uniquely identify a document record (e.g. BL Number, Invoice Number).</p>
              <div className="flex flex-wrap gap-2">
                {allFields.map((f) => {
                  const active = uniqueIdFields.includes(f);
                  return (
                    <button key={f} onClick={() =>
                      setUniqueIdFields((prev) => active ? prev.filter((x) => x !== f) : [...prev, f])}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Secondary ID Fields</h4>
              <p className="text-xs text-gray-400 mb-3">Additional linking keys used for deduplication or grouping (e.g. Container Number, PO Number).</p>
              <div className="flex flex-wrap gap-2">
                {allFields.map((f) => {
                  const active = secondaryIdFields.includes(f);
                  return (
                    <button key={f} onClick={() =>
                      setSecondaryIdFields((prev) => active ? prev.filter((x) => x !== f) : [...prev, f])}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"}`}>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "refid" && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Reference ID Fields</h4>
              <p className="text-xs text-gray-400 mb-3">
                Fields used as reference identifiers for cross-document linking (e.g. PO Number, Shipment Ref).
              </p>
              <div className="flex flex-wrap gap-2">
                {allFields.map((f) => {
                  const active = referenceIdFields.includes(f);
                  return (
                    <button key={f} onClick={() =>
                      setReferenceIdFields((prev) => active ? prev.filter((x) => x !== f) : [...prev, f])}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${active ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-600 border-gray-300 hover:border-amber-400"}`}>
                      {f}
                    </button>
                  );
                })}
              </div>
              {referenceIdFields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {referenceIdFields.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-0.5 font-medium">
                      {f}
                      <button onClick={() => setReferenceIdFields((prev) => prev.filter((x) => x !== f))}
                        className="ml-0.5 text-amber-400 hover:text-amber-700">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Comment / log section */}
      <div className="border-t border-gray-200 mt-4 pt-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Comments &amp; Change Log</h4>
        <div className="flex gap-2">
          <input type="text" value={commentText} placeholder="Add a comment or change note…"
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAddComment())}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 ring-blue-400 outline-none" />
          <button onClick={handleAddComment} disabled={!commentText.trim() || addingComment}
            className="text-xs bg-gray-700 text-white px-3 py-2 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {addingComment ? "…" : "Post"}
          </button>
        </div>
        {comments.length === 0
          ? <p className="text-xs text-gray-400 italic">No comments yet.</p>
          : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <span className="font-medium text-gray-700 whitespace-nowrap">{c.user}</span>
                  <span className="text-gray-400 whitespace-nowrap">
                    {new Date(c.timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="text-gray-600">{c.text}</span>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────

export default function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [view, setView] = useState<View>("list");
  const [reviewResult, setReviewResult] = useState<ExtractionResult | null>(null);
  const [reviewFileId, setReviewFileId] = useState<string>("");
  const [reviewDocGroups, setReviewDocGroups] = useState<DocumentGroup[]>([]);
  const [reviewFieldConfig, setReviewFieldConfig] = useState<Record<string, FieldConfig> | undefined>(undefined);
  const [configTemplate, setConfigTemplate] = useState<Template | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    const res = await uploadPdf(f);
    setUploading(false);
    if (res.success && res.data) {
      setFile(f);
      setUploadResult(res.data);
    } else {
      setUploadError(res.error || "Upload failed");
    }
  };

  const handleChangeFile = () => {
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
  };

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    const res = await getTemplates();
    if (res.success && res.data) setTemplates(res.data);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteTemplate(id);
    if (res.success) setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaved = (t: Template) => {
    setTemplates((prev) => [t, ...prev]);
    setView("list");
  };

  const handleReview = (result: ExtractionResult, fileId: string, docGroups: DocumentGroup[], fc?: Record<string, FieldConfig>) => {
    setReviewResult(result);
    setReviewFileId(fileId);
    setReviewDocGroups(docGroups);
    setReviewFieldConfig(fc);
    setView("review");
  };

  const handleConfigure = (t: Template) => {
    setConfigTemplate(t);
    setView("configure");
  };

  const handleConfigSaved = (updated: Template) => {
    setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setView("list");
    setConfigTemplate(null);
  };

  if (view === "create") {
    return <CreateForm onSaved={handleSaved} onCancel={() => setView("list")} />;
  }

  if (view === "configure" && configTemplate) {
    return (
      <FileConfigPanel
        template={configTemplate}
        allTemplates={templates}
        onSaved={handleConfigSaved}
        onCancel={() => { setView("list"); setConfigTemplate(null); }}
      />
    );
  }

  if (view === "review" && reviewResult) {
    return (
      <ReviewPanel
        result={reviewResult} fileId={reviewFileId} docGroups={reviewDocGroups}
        fieldConfig={reviewFieldConfig}
        onClose={() => setView("list")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Document Templates</h3>
        <button onClick={() => setView("create")}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          + New Template
        </button>
      </div>

      {!uploadResult ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Upload a PDF to detect and extract data using a template below.</p>
          <FileUploadZone onFiles={handleFileUpload} multiple={false} uploading={uploading} />
          {uploadError && <p className="text-red-600 text-xs">{uploadError}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
          <span className="truncate">{file?.name} · {uploadResult.page_count} page{uploadResult.page_count === 1 ? "" : "s"}</span>
          <button onClick={handleChangeFile} className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-3">
            Choose a different file
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No templates yet.</p>
          <p className="text-xs mt-1">Create one to start extracting structured data from PDFs.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {[...templates]
            .sort((a, b) => (isInvoiceType(a.template_type) ? 0 : 1) - (isInvoiceType(b.template_type) ? 0 : 1))
            .map((t) => (
              <TemplateCard
                key={t.id} template={t} uploadResult={uploadResult}
                onDelete={() => handleDelete(t.id)} onReview={handleReview}
                onConfigure={handleConfigure}
              />
            ))}
        </ul>
      )}
    </div>
  );
}
