"use client";

import { useEffect, useRef, useState } from "react";
import {
  getFileRecords, getFileRecord, setFileStatus, deleteFileRecord, getWorkflowStates,
  getTemplates, extractTemplateData, refineExtraction, updateFileField,
  assignFile, bulkUpdateStatus, bulkDelete, smartExtract,
  setFieldDecision, setRecordDecision, getFileComments, postFileComment,
  getIntegrations, pushToIntegration,
} from "@/lib/api";
import type { FileRecord, WorkflowState, Template, FieldMeta, TemplateComment, FieldPosition, Integration } from "@/lib/api";
import { PdfPageViewer, FileThumbnail } from "@/components/PdfPageViewer";
import ProposeTemplateModal from "@/components/ProposeTemplateModal";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Refine with AI modal ──────────────────────────────────────────────────

function RefineModal({
  record,
  onClose,
  onRefined,
}: {
  record: FileRecord;
  onClose: () => void;
  onRefined: (updated: FileRecord) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [mode, setMode] = useState<"headers" | "table">("headers");
  const [pageNum, setPageNum] = useState(record.pages[0]?.page_number ?? 1);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefine = async () => {
    if (!instructions.trim()) { setError("Instructions are required"); return; }
    if (!record.template_id) { setError("File has no template — re-extract with a template first"); return; }
    const page = record.pages.find((p) => p.page_number === pageNum) ?? record.pages[0];
    if (!page) { setError("No page data available"); return; }
    setRefining(true);
    setError(null);
    const res = await refineExtraction({
      template_id: record.template_id,
      file_id: record.id,
      page_number: page.page_number,
      current_fields: page.fields,
      current_table_rows: page.table_rows,
      instructions,
      mode,
    });
    if (!res.success || !res.data) {
      setError(res.error ?? "Refinement failed");
      setRefining(false);
      return;
    }
    // Merge refined values back into the record's pages
    const updatedPages = record.pages.map((p) => {
      if (p.page_number !== page.page_number) return p;
      return {
        ...p,
        fields: res.data!.fields ?? p.fields,
        table_rows: res.data!.table_rows ?? p.table_rows,
      };
    });
    // Persist each changed field
    const newFields = res.data.fields ?? {};
    for (const [field, value] of Object.entries(newFields)) {
      await updateFileField(record.id, field, value, "update");
    }
    const updatedRecord: FileRecord = { ...record, pages: updatedPages };
    setRefining(false);
    onRefined(updatedRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Refine with AI</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["headers", "table"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors
                  ${mode === m ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 hover:bg-gray-50"}`}>
                {m === "headers" ? "Header Fields" : "Table Rows"}
              </button>
            ))}
          </div>
          {record.pages.length > 1 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Page</label>
              <select value={pageNum} onChange={(e) => setPageNum(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                {record.pages.map((p) => (
                  <option key={p.page_number} value={p.page_number}>Page {p.page_number}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Instructions</label>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4}
              placeholder="e.g. The gross weight unit should be KG not LBS. Also the shipper name appears to be truncated — extract the full name."
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleRefine} disabled={refining || !instructions.trim()}
            className="flex items-center gap-2 text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {refining && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>}
            {refining ? "Refining…" : "Refine"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Re-extract modal ─────────────────────────────────────────────────────

function ReextractModal({
  record,
  onClose,
  onExtracted,
  initialTemplateId,
}: {
  record: FileRecord;
  onClose: () => void;
  onExtracted: (updated: FileRecord) => void;
  initialTemplateId?: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState(initialTemplateId ?? record.template_id ?? "");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTemplates().then((res) => {
      if (res.success && res.data) {
        setTemplates(res.data);
        if (!templateId && res.data[0]) setTemplateId(res.data[0].id);
      }
    });
  }, []);

  const handleExtract = async () => {
    if (!templateId) { setError("Select a template"); return; }
    setExtracting(true);
    setError(null);
    const res = await extractTemplateData(templateId, record.id);
    setExtracting(false);
    if (!res.success || !res.data) { setError(res.error ?? "Extraction failed"); return; }
    // Build updated record from result
    const updated: FileRecord = {
      ...record,
      template_id: templateId,
      template_name: res.data.template_name,
      template_type: res.data.template_type,
      extracted_at: new Date().toISOString(),
      decision: res.data.decision ?? record.decision,
      pages: res.data.pages.map((p) => ({
        page_number: p.page_number,
        fields: p.fields,
        field_meta: p.field_meta,
        table_rows: p.table_rows,
        table_evidence: p.table_evidence,
        applied_conditions: p.applied_conditions,
        text_preview: p.text_preview,
      })),
    };
    onExtracted(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[400px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Re-extract</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Template</label>
          {templates.length === 0 ? (
            <p className="text-xs text-gray-400">No templates found. Create one in the Templates tab.</p>
          ) : (
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This will overwrite all existing extracted field data for this file.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleExtract} disabled={extracting || !templateId || templates.length === 0}
            className="flex items-center gap-2 text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {extracting && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>}
            {extracting ? "Extracting…" : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Smart Extract modal ──────────────────────────────────────────────────

function SmartExtractModal({
  record,
  onClose,
  onExtracted,
}: {
  record: FileRecord;
  onClose: () => void;
  onExtracted: (updated: FileRecord) => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    const res = await smartExtract(record.id);
    setExtracting(false);
    if (!res.success || !res.data) { setError(res.error ?? "Extraction failed"); return; }
    const pages = res.data.pages;
    const docType = pages.find((p) => p.document_type)?.document_type ?? "Smart Extract";
    const updated: FileRecord = {
      ...record,
      template_id: null,
      template_name: docType,
      template_type: docType,
      extracted_at: new Date().toISOString(),
      decision: res.data.decision ?? record.decision,
      pages: pages.map((p) => ({
        page_number: p.page_number,
        fields: p.fields,
        field_meta: p.field_meta,
        table_rows: p.table_rows,
        table_evidence: p.table_evidence,
        applied_conditions: [],
        text_preview: p.text_preview,
      })),
    };
    onExtracted(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Smart Extract</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <p className="text-sm text-gray-700">
          Claude will analyse this document, infer its type, and extract all key fields and tables automatically — no template needed.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This will overwrite any existing extracted field data.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleExtract} disabled={extracting}
            className="flex items-center gap-2 text-sm bg-teal-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">
            {extracting && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>}
            {extracting ? "Analysing…" : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Editable field card ───────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 90
    ? "bg-green-50 text-green-700 border-green-200"
    : confidence >= 70
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${color}`}>
      {confidence}%
    </span>
  );
}

function DecisionDot({ status }: { status?: FieldMeta["status"] }) {
  if (status === "approved") return <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title="Approved" />;
  if (status === "rejected") return <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Rejected" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" title="Needs review" />;
}

function FieldCard({
  fieldKey,
  value,
  meta,
  onSave,
  onDelete,
  onDecision,
  hasPosition,
  isActive,
  onHighlight,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  fieldKey: string;
  value: string | null;
  meta?: FieldMeta;
  onSave: (key: string, val: string | null, reason?: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onDecision?: (key: string, status: "approved" | "rejected") => Promise<void>;
  hasPosition?: boolean;
  isActive?: boolean;
  onHighlight?: (key: string | null) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const editing = isEditing;
  const [draft, setDraft] = useState(value ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // Another field taking over edit mode counts as cancelling this one — reset the draft
  // so a stale, unsaved edit doesn't reappear next time this card is opened.
  useEffect(() => { if (!editing) { setDraft(value ?? ""); setReason(""); } }, [editing]);

  const isCorrection = !!meta && draft !== (value ?? "");

  const commit = async () => {
    setSaving(true);
    await onSave(fieldKey, draft || null, isCorrection ? reason.trim() || undefined : undefined);
    setSaving(false);
    onStopEdit();
    setReason("");
  };

  const cancel = () => { setDraft(value ?? ""); setReason(""); onStopEdit(); };

  return (
    <div className={`group relative bg-gray-50 rounded-lg border-l-2 px-3 py-2.5 transition-all
      ${editing ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-200" : isActive ? "border-amber-400 bg-amber-50/50 ring-1 ring-amber-200" : "border-gray-300 hover:border-blue-300"}`}>
      <div className="flex items-center gap-1.5 mb-1 pr-20">
        {meta && <DecisionDot status={meta.status} />}
        {hasPosition && onHighlight ? (
          <button type="button"
            onClick={() => onHighlight(isActive ? null : fieldKey)}
            title="Click to highlight in document"
            className={`text-xs truncate flex-1 text-left cursor-pointer ${isActive ? "text-amber-700 font-medium" : "text-blue-600 hover:text-blue-800"}`}>
            {fieldKey}<span className="ml-1 opacity-50">⌖</span>
          </button>
        ) : (
          <p className="text-xs text-gray-500 truncate flex-1">{fieldKey}</p>
        )}
        {meta && <ConfidenceBadge confidence={meta.confidence} />}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
            className="flex-1 text-sm bg-white border rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400 min-w-0" />
          <button onClick={commit} disabled={saving}
            className="text-blue-600 hover:text-blue-800 flex-shrink-0 disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button onClick={cancel} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}
      {editing && isCorrection && (
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Why? (optional — teaches future extractions)"
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className="w-full mt-1.5 text-[11px] bg-white border rounded px-2 py-1 outline-none focus:ring-1 ring-purple-400 text-gray-600" />
      )}
      {!editing && (
        <p className={`text-sm font-medium truncate cursor-text ${value ? "text-gray-900" : "text-gray-300 italic"}`}
          onClick={onStartEdit}>
          {value ?? "—"}
        </p>
      )}
      {meta?.evidence && !editing && (
        <p className="text-[11px] text-gray-400 italic truncate mt-0.5" title={meta.evidence}>
          {meta.evidence}
        </p>
      )}
      {!editing && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onDecision && (
            <>
              <button onClick={() => onDecision(fieldKey, "approved")} title="Approve field"
                className={`transition-colors ${meta?.status === "approved" ? "text-green-600" : "text-gray-300 hover:text-green-600"}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={() => onDecision(fieldKey, "rejected")} title="Reject field"
                className={`transition-colors ${meta?.status === "rejected" ? "text-red-600" : "text-gray-300 hover:text-red-600"}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
          <button onClick={onStartEdit} title="Edit"
            className="text-gray-300 hover:text-blue-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={() => onDelete(fieldKey)} title="Delete field"
            className="text-gray-300 hover:text-red-500 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Audit Trail ────────────────────────────────────────────────────────────

function AuditTrail({ fileId }: { fileId: string }) {
  const [comments, setComments] = useState<TemplateComment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getFileComments(fileId).then((res) => {
      if (res.success && res.data) setComments(res.data);
      setLoading(false);
    });
  }, [fileId]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setPosting(true);
    const res = await postFileComment(fileId, text.trim());
    setPosting(false);
    if (res.success && res.data) {
      setComments((prev) => [res.data!, ...prev]);
      setText("");
    }
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Audit Trail</h4>
      <div className="flex gap-2 mb-4">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Add a comment…"
          className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-1 ring-blue-400" />
        <button onClick={handleSubmit} disabled={posting || !text.trim()}
          className="text-sm bg-blue-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 flex-shrink-0">
          Submit
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400">No comments yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => (
            <li key={c.id} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-gray-700 text-xs">{c.user}</span>
                <span className="text-[11px] text-gray-400">{formatDate(c.timestamp)}</span>
              </div>
              <p className="text-gray-600">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── File Detail full-page view ────────────────────────────────────────────

function FileDetailView({
  record: initialRecord,
  workflowStates,
  onBack,
  onStatusChange,
  onDeleted,
}: {
  record: FileRecord;
  workflowStates: WorkflowState[];
  onBack: () => void;
  onStatusChange: (r: FileRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [record, setRecord] = useState<FileRecord>(initialRecord);
  const [tab, setTab] = useState<"headers" | "supporting">("headers");
  const [saving, setSaving] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [showReextract, setShowReextract] = useState(false);
  const [showSmartExtract, setShowSmartExtract] = useState(false);
  const [showProposeTemplate, setShowProposeTemplate] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [assignedTo, setAssignedTo] = useState(record.assigned_to ?? "");
  const [savingAssign, setSavingAssign] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [showOriginal, setShowOriginal] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [pushTargetId, setPushTargetId] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    getIntegrations().then((res) => {
      if (res.success && res.data) {
        const active = res.data.filter((i) => i.active);
        setIntegrations(active);
        if (active.length > 0) setPushTargetId(active[0].id);
      }
    });
  }, []);

  const handlePush = async () => {
    if (!pushTargetId) return;
    setPushing(true);
    setPushResult(null);
    const res = await pushToIntegration(pushTargetId, [record.id]);
    setPushing(false);
    setPushResult({
      success: res.success && !!res.data?.success,
      message: res.data
        ? `${res.data.success ? "✓" : "✗"} ${res.data.response_body.slice(0, 200)}`
        : (res.error ?? "Push failed"),
    });
  };

  const currentStatus = record.status;
  const currentIdx = workflowStates.findIndex((s) => s.name === currentStatus);
  // Aggregate all fields (first non-null wins across pages), remembering which
  // page each field's highlight position lives on so clicking a field jumps
  // the viewer to the right page.
  const allFields: Record<string, string | null> = {};
  const allFieldsMeta: Record<string, FieldMeta> = {};
  const fieldPageIdx: Record<string, number> = {};
  record.pages.forEach((page, pageIdx) => {
    for (const [k, v] of Object.entries(page.fields)) {
      if (allFields[k] === undefined || (v !== null && allFields[k] === null)) {
        allFields[k] = v;
      }
      if (page.field_positions?.[k] && fieldPageIdx[k] === undefined) {
        fieldPageIdx[k] = pageIdx;
      }
    }
    for (const [k, m] of Object.entries(page.field_meta ?? {})) {
      if (!allFieldsMeta[k]) allFieldsMeta[k] = m;
    }
  });
  const metaCount = Object.keys(allFieldsMeta).length;
  const needsReviewCount = Object.values(allFieldsMeta).filter((m) => m.status !== "approved").length;

  const tableRows = record.pages.flatMap((p) => p.table_rows);
  const tableEvidence = record.pages.map((p) => p.table_evidence).filter(Boolean) as string[];

  const handleStatus = async (stateName: string) => {
    setSaving(true);
    const res = await setFileStatus(record.id, stateName);
    setSaving(false);
    if (res.success && res.data) {
      setRecord(res.data);
      onStatusChange(res.data);
    }
  };

  const handleSaveField = async (key: string, val: string | null, reason?: string) => {
    const res = await updateFileField(record.id, key, val, "update", reason);
    if (res.success && res.data) { setRecord(res.data); onStatusChange(res.data); }
  };

  const handleDeleteField = async (key: string) => {
    const res = await updateFileField(record.id, key, null, "delete");
    if (res.success && res.data) { setRecord(res.data); onStatusChange(res.data); }
  };

  const handleAddField = async () => {
    if (!newKey.trim()) return;
    const res = await updateFileField(record.id, newKey.trim(), newVal || null, "add");
    if (res.success && res.data) {
      setRecord(res.data);
      onStatusChange(res.data);
      setNewKey("");
      setNewVal("");
      setAddingField(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteFileRecord(record.id);
    if (res.success) onDeleted(record.id);
    setDeleting(false);
  };

  const handleRefined = (updated: FileRecord) => { setRecord(updated); onStatusChange(updated); };
  const handleExtracted = (updated: FileRecord) => { setRecord(updated); onStatusChange(updated); };

  const [decisioning, setDecisioning] = useState(false);
  const handleFieldDecision = async (key: string, status: "approved" | "rejected") => {
    const res = await setFieldDecision(record.id, key, status);
    if (res.success && res.data) { setRecord(res.data); onStatusChange(res.data); }
  };
  const handleRecordDecision = async (decision: "approved" | "for_review" | "rejected") => {
    setDecisioning(true);
    const res = await setRecordDecision(record.id, decision);
    setDecisioning(false);
    if (res.success && res.data) { setRecord(res.data); onStatusChange(res.data); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4">
        <button onClick={onBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{record.filename}</h3>
          <p className="text-xs text-gray-400">
            {record.page_count}p · {formatBytes(record.size_bytes)}
            {record.template_name && <> · <span className="text-indigo-600">{record.template_name}</span></>}
            {record.extracted_at && <> · Extracted {formatDate(record.extracted_at)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRefine(true)}
            className="flex items-center gap-1.5 text-xs border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Refine with AI
          </button>
          <button onClick={() => setShowSmartExtract(true)}
            className="flex items-center gap-1.5 text-xs border border-teal-300 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Smart Extract
          </button>
          <button onClick={() => setShowReextract(true)}
            className="flex items-center gap-1.5 text-xs border text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Re-extract
          </button>
          {metaCount > 0 && (
            <span className="text-xs text-gray-400">
              {needsReviewCount === 0 ? "all fields approved" : `${needsReviewCount}/${metaCount} need review`}
            </span>
          )}
          <div className="flex items-center rounded-lg border overflow-hidden">
            <button onClick={() => handleRecordDecision("approved")} disabled={decisioning}
              className={`text-xs px-3 py-1.5 font-medium transition-colors disabled:opacity-50
                ${record.decision === "approved" ? "bg-green-600 text-white" : "text-green-700 hover:bg-green-50"}`}>
              Approve
            </button>
            <button onClick={() => handleRecordDecision("for_review")} disabled={decisioning}
              className={`text-xs px-3 py-1.5 font-medium border-l transition-colors disabled:opacity-50
                ${record.decision === "for_review" ? "bg-amber-500 text-white" : "text-amber-700 hover:bg-amber-50"}`}>
              For Review
            </button>
            <button onClick={() => handleRecordDecision("rejected")} disabled={decisioning}
              className={`text-xs px-3 py-1.5 font-medium border-l transition-colors disabled:opacity-50
                ${record.decision === "rejected" ? "bg-red-600 text-white" : "text-red-700 hover:bg-red-50"}`}>
              Reject
            </button>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {currentStatus}
          </span>
          <button onClick={handleDelete} disabled={deleting}
            title="Delete file record"
            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {!record.template_id && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <span className="text-amber-800">
            {record.suggested_template_name
              ? `Suggested match: ${record.suggested_template_name} — apply it by clicking on Run Extraction below.`
              : "No template matches this document."}
          </span>
          <button onClick={() => setShowProposeTemplate(true)}
            className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 transition-colors ml-auto">
            Create Template From This Document
          </button>
        </div>
      )}

      {integrations.length > 0 && Object.keys(allFields).length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <span className="text-indigo-800 font-medium flex-shrink-0">Push extracted data to:</span>
          {integrations.length > 1 ? (
            <select value={pushTargetId} onChange={(e) => setPushTargetId(e.target.value)}
              className="text-xs border border-indigo-300 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 ring-indigo-400">
              {integrations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          ) : (
            <span className="text-xs text-indigo-700 font-medium">{integrations[0]?.name}</span>
          )}
          <button onClick={handlePush} disabled={pushing || !pushTargetId}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors ml-auto flex-shrink-0">
            {pushing ? "Pushing…" : "Push"}
          </button>
        </div>
      )}

      {pushResult && (
        <p className={`text-xs px-3 py-2 rounded-lg border mb-4 font-mono break-words ${pushResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {pushResult.message}
        </p>
      )}

      {/* File Status / Assigned To — moved up top to free room below */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border rounded-xl p-3 bg-white">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">File Status</h4>
          {workflowStates.length === 0 ? (
            <p className="text-xs text-gray-400">No workflow states configured.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {workflowStates.map((state, idx) => {
                const isDone = currentIdx >= 0 && idx <= currentIdx;
                const isCurrent = state.name === currentStatus;
                return (
                  <button key={state.id} disabled={saving} onClick={() => handleStatus(state.name)}
                    className={`flex items-center gap-1.5 text-left transition-colors group
                      ${isCurrent ? "text-blue-700" : isDone ? "text-gray-700" : "text-gray-400"}`}>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                      ${isCurrent ? "border-blue-600 bg-blue-600" : isDone ? "border-green-500 bg-green-500" : "border-gray-300 bg-white group-hover:border-blue-400"}`}>
                      {isDone && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-blue-700" : isDone ? "text-gray-700" : "text-gray-400"}`}>
                      {state.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border rounded-xl p-3 bg-white">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Assigned To</h4>
          <input
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            onBlur={async () => {
              setSavingAssign(true);
              const res = await assignFile(record.id, assignedTo || null);
              if (res.success && res.data) onStatusChange(res.data);
              setSavingAssign(false);
            }}
            placeholder="Name or email"
            className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400"
          />
          {savingAssign && <p className="text-[10px] text-gray-400 mt-1">Saving…</p>}
        </div>
      </div>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left — tabs + content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex border-b mb-4">
            {(["headers", "supporting"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {t === "headers" ? "Inv. Headers" : "All Supporting Documents"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "headers" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">
                    {record.template_name ? `${record.template_name} Fields` : "Extracted Fields"}
                  </h4>
                  <div className="flex items-center gap-2">
                    {record.pages.length > 0 && (
                      <button onClick={() => setShowOriginal((s) => !s)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${showOriginal ? "bg-blue-50 border-blue-200 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                        {showOriginal ? "Hide original" : "Show original"}
                      </button>
                    )}
                    <button onClick={() => setAddingField(true)}
                      className="text-xs text-blue-600 border border-dashed border-blue-300 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                      + Add Field
                    </button>
                    {!record.template_id && Object.keys(allFields).length > 0 && (
                      <button onClick={() => setShowReextract(true)}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                        Run extraction →
                      </button>
                    )}
                  </div>
                </div>

                {/* Add field inline form */}
                {addingField && (
                  <div className="flex gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <input value={newKey} onChange={(e) => setNewKey(e.target.value)}
                      placeholder="Field name" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddField(); if (e.key === "Escape") setAddingField(false); }}
                      className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
                    <input value={newVal} onChange={(e) => setNewVal(e.target.value)}
                      placeholder="Value (optional)"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddField(); if (e.key === "Escape") setAddingField(false); }}
                      className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
                    <button onClick={handleAddField}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700">Add</button>
                    <button onClick={() => { setAddingField(false); setNewKey(""); setNewVal(""); }}
                      className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                )}

                {Object.keys(allFields).length === 0 && !addingField ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <p>No extraction data yet.</p>
                    <button onClick={() => setShowReextract(true)}
                      className="block mx-auto mt-2 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      Run extraction →
                    </button>
                  </div>
                ) : (
                  <div className={showOriginal && record.pages.length > 0 ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3"}>
                    {Object.entries(allFields).map(([key, val]) => (
                      <FieldCard key={key} fieldKey={key} value={val} meta={allFieldsMeta[key]}
                        onSave={handleSaveField} onDelete={handleDeleteField} onDecision={handleFieldDecision}
                        hasPosition={fieldPageIdx[key] !== undefined}
                        isActive={activeField === key}
                        onHighlight={(k) => {
                          setActiveField(k);
                          if (k && fieldPageIdx[k] !== undefined) setActivePageIdx(fieldPageIdx[k]);
                        }}
                        isEditing={editingField === key}
                        onStartEdit={() => setEditingField(key)}
                        onStopEdit={() => setEditingField((cur) => (cur === key ? null : cur))} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "supporting" && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Table Data</h4>
                {tableEvidence.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {tableEvidence.map((ev, i) => (
                      <p key={i} className="text-xs text-gray-500 italic bg-gray-50 border border-gray-200 rounded px-3 py-2">
                        <span className="font-semibold not-italic text-gray-600">TABLE EVIDENCE: </span>{ev}
                      </p>
                    ))}
                  </div>
                )}
                {tableRows.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">No table data extracted.</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b text-gray-600">
                          {Object.keys(tableRows[0]).map((col) => (
                            <th key={col} className="text-left px-3 py-2 font-medium whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, i) => (
                          <tr key={i} className={`border-b last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">{val ?? "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {record.pages.some((p) => (p.applied_conditions ?? []).length > 0) && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Applied Rules</h4>
                    <ul className="space-y-1">
                      {record.pages.flatMap((p) => p.applied_conditions ?? []).map((c, i) => (
                        <li key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">⚠ {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <AuditTrail fileId={record.id} />
          </div>
        </div>

        {/* Original document — for cross-referencing extracted values */}
        {showOriginal && tab === "headers" && record.pages.length > 0 && (
          <div className="w-[36rem] flex-shrink-0 flex flex-col border rounded-xl bg-white overflow-hidden sticky top-0 self-start max-h-[calc(100vh-4rem)]">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
              <span className="text-xs font-semibold text-gray-600">Original document</span>
              {record.pages.length > 1 && (
                <select
                  value={activePageIdx}
                  onChange={(e) => { setActivePageIdx(Number(e.target.value)); setActiveField(null); }}
                  className="text-xs border rounded px-1.5 py-0.5 bg-white">
                  {record.pages.map((p, idx) => (
                    <option key={p.page_number} value={idx}>Page {p.page_number}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <PdfPageViewer
                fileId={record.id}
                pageNumber={record.pages[activePageIdx]?.page_number ?? 1}
                activeField={activeField}
                fieldPositions={record.pages[activePageIdx]?.field_positions ?? {}}
                pageWidth={record.pages[activePageIdx]?.page_width ?? 0}
                pageHeight={record.pages[activePageIdx]?.page_height ?? 0}
              />
            </div>
          </div>
        )}

      </div>

      {showRefine && (
        <RefineModal record={record} onClose={() => setShowRefine(false)} onRefined={handleRefined} />
      )}
      {showReextract && (
        <ReextractModal record={record} onClose={() => { setShowReextract(false); setPendingTemplateId(null); }}
          onExtracted={handleExtracted} initialTemplateId={pendingTemplateId ?? undefined} />
      )}
      {showSmartExtract && (
        <SmartExtractModal record={record} onClose={() => setShowSmartExtract(false)} onExtracted={handleExtracted} />
      )}
      {showProposeTemplate && (
        <ProposeTemplateModal
          fileId={record.id}
          onClose={() => setShowProposeTemplate(false)}
          onCreated={(tmpl) => {
            setShowProposeTemplate(false);
            setPendingTemplateId(tmpl.id);
            setShowReextract(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${color}`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs font-medium opacity-70">{label}</span>
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────

export default function FileDashboard({
  focusFileIds,
  onFocusHandled,
}: {
  focusFileIds?: string[] | null;
  onFocusHandled?: () => void;
} = {}) {
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workflowStates, setWorkflowStates] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);
  const [listFilterIds, setListFilterIds] = useState<string[] | null>(null);
  const [templateFilter, setTemplateFilter] = useState(""); // "" = none picked yet (empty state), "all" = every file
  const [contentSearch, setContentSearch] = useState("");

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!focusFileIds || focusFileIds.length === 0) return;
    if (focusFileIds.length > 1) {
      setListFilterIds(focusFileIds);
      onFocusHandled?.();
      return;
    }
    const id = focusFileIds[0];
    const match = records.find((r) => r.id === id);
    if (match) {
      setSelected(match);
      onFocusHandled?.();
      return;
    }
    // Not in the already-loaded list yet — most likely a file that was just
    // uploaded after that initial load ran. Fetch it directly instead of
    // silently giving up, so "upload → jump straight into its detail view"
    // works even though the list hasn't caught up.
    getFileRecord(id).then((res) => {
      if (res.success && res.data) {
        const fetched = res.data;
        setRecords((prev) => (prev.some((r) => r.id === fetched.id) ? prev : [fetched, ...prev]));
        setSelected(fetched);
      }
      onFocusHandled?.();
    });
  }, [focusFileIds]);

  const loadAll = async () => {
    setLoading(true);
    const [recRes, wfRes, tplRes] = await Promise.all([getFileRecords(), getWorkflowStates(), getTemplates()]);
    if (recRes.success && recRes.data) setRecords(recRes.data);
    if (wfRes.success && wfRes.data) setWorkflowStates(wfRes.data);
    if (tplRes.success && tplRes.data) setTemplates(tplRes.data);
    setLoading(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleting(id);
    const res = await deleteFileRecord(id);
    if (res.success) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selected?.id === id) setSelected(null);
    }
    setDeleting(null);
  };

  const handleStatusChange = (updated: FileRecord) => {
    setRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setSelected(updated);
  };

  const handleDeleted = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setSelected(null);
  };

  const toggleCheck = (id: string) => setCheckedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => setCheckedIds(checkedIds.size === displayedRecords.length ? new Set() : new Set(displayedRecords.map((r) => r.id)));

  const handleBulkStatus = async () => {
    if (!bulkStatus || checkedIds.size === 0) return;
    setBulkWorking(true);
    const res = await bulkUpdateStatus(Array.from(checkedIds), bulkStatus);
    if (res.success) {
      setRecords((prev) => prev.map((r) => checkedIds.has(r.id) ? { ...r, status: bulkStatus } : r));
      setCheckedIds(new Set());
      setBulkStatus("");
    }
    setBulkWorking(false);
  };

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) return;
    setBulkWorking(true);
    const res = await bulkDelete(Array.from(checkedIds));
    if (res.success) {
      const ids = checkedIds;
      setRecords((prev) => prev.filter((r) => !ids.has(r.id)));
      setCheckedIds(new Set());
    }
    setBulkWorking(false);
  };

  if (selected) {
    return (
      <FileDetailView
        record={selected}
        workflowStates={workflowStates}
        onBack={() => setSelected(null)}
        onStatusChange={handleStatusChange}
        onDeleted={handleDeleted}
      />
    );
  }

  const stateCounts: Record<string, number> = {};
  for (const r of records) stateCounts[r.status] = (stateCounts[r.status] ?? 0) + 1;
  const approvedCount = stateCounts["Approved"] ?? 0;
  const rejectedCount = stateCounts["Rejected"] ?? 0;
  const newCount = stateCounts["New"] ?? 0;
  const trimmedSearch = contentSearch.trim().toLowerCase();
  const matchesSearch = (r: FileRecord) => {
    if (!trimmedSearch) return true;
    if (r.filename.toLowerCase().includes(trimmedSearch)) return true;
    return r.pages.some((p) =>
      Object.values(p.fields).some((v) => v != null && String(v).toLowerCase().includes(trimmedSearch))
    );
  };
  // A search query on its own is enough to search across every file — no
  // need to also pick a template first, same as choosing "All templates".
  const baseRecords = listFilterIds
    ? records.filter((r) => listFilterIds.includes(r.id))
    : templateFilter === "all"
      ? records
      : templateFilter
        ? records.filter((r) => r.template_id === templateFilter)
        : trimmedSearch
          ? records
          : [];
  const displayedRecords = trimmedSearch ? baseRecords.filter(matchesSearch) : baseRecords;
  const noFilterChosen = !listFilterIds && !templateFilter && !trimmedSearch;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Files"  value={records.length} color="bg-gray-50 border-gray-200 text-gray-800" />
        <StatCard label="Approved"     value={approvedCount}  color="bg-green-50 border-green-200 text-green-800" />
        <StatCard label="Rejected"     value={rejectedCount}  color="bg-red-50 border-red-200 text-red-800" />
        <StatCard label="New"          value={newCount}       color="bg-blue-50 border-blue-200 text-blue-800" />
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Processed Files</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                placeholder="Search extracted data…"
                title="Searches values inside extracted fields, e.g. a vessel name or reference number — not just the filename"
                className="pl-8 pr-2.5 py-1.5 text-xs border rounded-lg outline-none focus:ring-1 ring-blue-400 bg-white w-56" />
            </div>
            <select
              value={templateFilter}
              onChange={(e) => { setTemplateFilter(e.target.value); setListFilterIds(null); setCheckedIds(new Set()); }}
              className="text-xs border rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-1 ring-blue-400 min-w-[180px]">
              <option value="">Select a template…</option>
              <option value="all">All templates</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={loadAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Refresh</button>
          </div>
        </div>

        {listFilterIds && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b text-sm">
            <span className="text-amber-800">
              Showing {displayedRecords.length} file{displayedRecords.length === 1 ? "" : "s"} from the selected email
            </span>
            <button onClick={() => setListFilterIds(null)} className="text-xs text-amber-700 hover:text-amber-900 font-medium ml-auto">
              Clear filter
            </button>
          </div>
        )}

        {/* Bulk action bar */}
        {checkedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b text-sm">
            <span className="text-blue-700 font-medium">{checkedIds.size} selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-white outline-none focus:ring-1 ring-blue-400">
                <option value="">Change status…</option>
                {workflowStates.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button onClick={handleBulkStatus} disabled={!bulkStatus || bulkWorking}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium hover:bg-blue-700 disabled:opacity-40">
                Apply
              </button>
              <button onClick={handleBulkDelete} disabled={bulkWorking}
                className="text-xs bg-red-500 text-white px-3 py-1 rounded font-medium hover:bg-red-600 disabled:opacity-40">
                Delete
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : displayedRecords.length === 0 && noFilterChosen ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Select a template above to view its files.</p>
            <p className="text-xs mt-1">Or choose "All templates" to see everything.</p>
          </div>
        ) : displayedRecords.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">{trimmedSearch ? "No files match that search." : "No files match this template yet."}</p>
            <p className="text-xs mt-1">
              {trimmedSearch
                ? "Searches the filename and every extracted field value, not just the file name."
                : "Files show up here once extracted or ingested with this template."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={displayedRecords.length > 0 && checkedIds.size === displayedRecords.length}
                    onChange={toggleAll} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-3 py-3 font-medium">Template</th>
                <th className="text-left px-3 py-3 font-medium">Pages</th>
                <th className="text-left px-3 py-3 font-medium">Uploaded</th>
                <th className="text-left px-3 py-3 font-medium">File Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((r) => {
                return (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className="border-b last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleCheck(r.id)}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileThumbnail fileId={r.id} />
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">{r.filename}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 pl-8">{formatBytes(r.size_bytes)}</p>
                    </td>
                    <td className="px-3 py-3">
                      {r.template_name ? (
                        <span className="text-xs bg-indigo-50 text-indigo-700 rounded px-2 py-0.5">{r.template_name}</span>
                      ) : r.suggested_template_name ? (
                        <span
                          className="text-xs bg-amber-50 text-amber-700 rounded px-2 py-0.5"
                          title="Suggested match — not yet applied"
                        >
                          Suggested: {r.suggested_template_name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600 tabular-nums">{r.page_count}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(r.uploaded_at)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-sm font-medium ${
                        r.status === "Rejected" ? "text-red-600"
                        : r.status === "Approved" ? "text-green-600"
                        : "text-gray-700"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={(e) => handleDelete(e, r.id)} disabled={deleting === r.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50" title="Delete">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
