"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  detectDocType,
  extractTemplateData,
} from "@/lib/api";
import type {
  Template,
  UploadResult,
  DetectedPage,
  ExtractionResult,
  ExtractedPage,
  FieldPosition,
} from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let _pdfjs: typeof import("pdfjs-dist") | null = null;
async function getPdfJs() {
  if (!_pdfjs) {
    _pdfjs = await import("pdfjs-dist");
    _pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${_pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return _pdfjs;
}

function PdfPageViewer({
  fileId,
  pageNumber,
  activeField,
  fieldPositions,
  pageWidth,
  pageHeight,
}: {
  fileId: string;
  pageNumber: number;
  activeField: string | null;
  fieldPositions: Record<string, FieldPosition>;
  pageWidth: number;
  pageHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setRendered(false);
    setLoadError(null);

    const render = async () => {
      try {
        const lib = await getPdfJs();
        if (cancelled) return;

        const pdf = await lib.getDocument({
          url: `${API_BASE}/preview/${fileId}`,
        }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const containerW = container.clientWidth || 400;
        const baseVp = page.getViewport({ scale: 1 });
        const scale = containerW / baseVp.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLoadError("Canvas 2D context unavailable");
          return;
        }

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : String(err));
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [fileId, pageNumber]);

  const highlight = activeField ? fieldPositions[activeField] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-100 min-h-[200px]"
    >
      <canvas ref={canvasRef} className="w-full block" />
      {!rendered && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
          Loading page…
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <p className="text-xs text-red-500 text-center bg-white rounded p-2 shadow-sm">
            {loadError}
          </p>
        </div>
      )}
      {rendered && highlight && pageWidth > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `calc(${(highlight.x0 / pageWidth) * 100}% - 3px)`,
            top: `calc(${(highlight.y0 / pageHeight) * 100}% - 3px)`,
            width: `calc(${((highlight.x1 - highlight.x0) / pageWidth) * 100}% + 6px)`,
            height: `calc(${((highlight.y1 - highlight.y0) / pageHeight) * 100}% + 6px)`,
            backgroundColor: "rgba(255, 200, 0, 0.55)",
            border: "3px solid #e67e00",
            borderRadius: "3px",
            boxShadow:
              "0 0 0 2px rgba(230, 126, 0, 0.35), 0 2px 8px rgba(0,0,0,0.25)",
          }}
        />
      )}
    </div>
  );
}

interface Props {
  uploadResult?: UploadResult | null;
}

type View = "list" | "create" | "review";

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
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="text-blue-400 hover:text-blue-700 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({
  onSaved,
  onCancel,
}: {
  onSaved: (t: Template) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [directLinkFields, setDirectLinkFields] = useState<string[]>([]);
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
      direct_link_fields: directLinkFields,
      table_fields: tableFields,
      special_conditions: specialConditions,
    });
    setSaving(false);
    if (res.success && res.data) {
      onSaved(res.data);
    } else {
      setError(res.error || "Failed to save template");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">New Template</h3>
        <button
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>

      {/* Step 1: Declare */}
      <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          1 — Declare
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">
              Template Name
            </label>
            <input
              placeholder="e.g. My Invoice Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">
              Document Type
            </label>
            <input
              placeholder="e.g. Invoice, DO, Shipment"
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-300 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Step 2: Direct Link Fields */}
      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          2 — Direct Link Fields
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Fields that identify this document type and will be extracted (e.g.
          Invoice ID, Invoice Date).
        </p>
        <TagInput
          label=""
          placeholder="e.g. Invoice ID"
          items={directLinkFields}
          onChange={setDirectLinkFields}
        />
      </div>

      {/* Step 3: Table */}
      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          3 — Table Columns
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Column names in the document&apos;s table (e.g. item, price, qty).
        </p>
        <TagInput
          label=""
          placeholder="e.g. item"
          items={tableFields}
          onChange={setTableFields}
        />
      </div>

      {/* Step 4: Special Conditions */}
      <div className="border rounded-xl p-4 bg-gray-50">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          4 — Special Conditions
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Conditional rules applied during extraction (e.g. if item contains
          wine then danger=1).
        </p>
        <TagInput
          label=""
          placeholder="e.g. if item contains wine then danger=1"
          items={specialConditions}
          onChange={setSpecialConditions}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim() || !templateType.trim()}
        className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Template"}
      </button>
    </div>
  );
}

function ReviewPageCard({
  page,
  pageIdx,
  fileId,
  activeField,
  onUpdateField,
  onUpdateTableCell,
  onFieldClick,
}: {
  page: ExtractedPage;
  pageIdx: number;
  fileId: string;
  activeField: string | null;
  onUpdateField: (pageIdx: number, key: string, value: string) => void;
  onUpdateTableCell: (
    pageIdx: number,
    rowIdx: number,
    col: string,
    value: string,
  ) => void;
  onFieldClick: (fieldName: string | null) => void;
}) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">
          Page {page.page_number}
        </span>
        <div className="flex items-center gap-2">
          {activeField && (
            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
              Highlighting: {activeField}
            </span>
          )}
          {page.applied_conditions.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
              ⚠ {page.applied_conditions.length} condition
              {page.applied_conditions.length !== 1 ? "s" : ""} triggered
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x" style={{ minHeight: "380px" }}>
        {/* Left: extracted data */}
        <div
          className="p-4 space-y-4 overflow-y-auto"
          style={{ maxHeight: "600px" }}
        >
          {/* Fields */}
          {Object.keys(page.fields).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Fields
              </p>
              <p className="text-xs text-gray-400">
                Click the label to highlight its location · All values are
                editable below.
              </p>
              {Object.entries(page.fields).map(([key, val]) => {
                const hasPosition = !!page.field_positions?.[key];
                const isActive = activeField === key;
                return (
                  <div
                    key={key}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1 transition-colors ${
                      isActive ? "bg-yellow-50 ring-1 ring-yellow-300" : ""
                    }`}
                  >
                    {/* Clickable label — separate from the input */}
                    <button
                      type="button"
                      onClick={() =>
                        hasPosition &&
                        onFieldClick(activeField === key ? null : key)
                      }
                      className={`text-xs w-28 flex-shrink-0 pt-2 text-left font-medium leading-tight ${
                        hasPosition
                          ? "cursor-pointer text-blue-600 hover:text-blue-800"
                          : "cursor-default text-gray-500"
                      } ${isActive ? "text-yellow-700" : ""}`}
                      title={
                        hasPosition
                          ? "Click to highlight in document"
                          : "No position data"
                      }
                    >
                      {key}
                      {hasPosition && (
                        <span className="ml-1 opacity-60">⌖</span>
                      )}
                    </button>
                    {/* Always-editable textarea */}
                    <textarea
                      value={val ?? ""}
                      onChange={(e) =>
                        onUpdateField(pageIdx, key, e.target.value)
                      }
                      rows={2}
                      className="flex-1 border rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:ring-2 ring-blue-300 outline-none bg-white resize-y min-h-[2.5rem]"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Table rows */}
          {page.table_rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Table
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(page.table_rows[0]).map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-semibold text-gray-600 border-b"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.table_rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b last:border-0">
                        {Object.entries(row).map(([col, cell]) => (
                          <td key={col} className="px-1 py-1">
                            <textarea
                              value={cell ?? ""}
                              onChange={(e) =>
                                onUpdateTableCell(
                                  pageIdx,
                                  rowIdx,
                                  col,
                                  e.target.value,
                                )
                              }
                              rows={2}
                              className="w-full px-2 py-1 text-xs text-gray-900 border rounded focus:ring-2 ring-blue-300 outline-none bg-white resize-y min-h-[2rem]"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Applied conditions */}
          {page.applied_conditions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">
                Conditions Applied
              </p>
              {page.applied_conditions.map((c, i) => (
                <p
                  key={i}
                  className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
                >
                  ⚠ {c}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Right: real PDF page with highlight overlay */}
        <div className="overflow-y-auto" style={{ maxHeight: "600px" }}>
          <PdfPageViewer
            fileId={fileId}
            pageNumber={page.page_number}
            activeField={activeField}
            fieldPositions={page.field_positions ?? {}}
            pageWidth={page.page_width}
            pageHeight={page.page_height}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  result,
  fileId,
  onClose,
}: {
  result: ExtractionResult;
  fileId: string;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [editedPages, setEditedPages] = useState<ExtractedPage[]>(
    result.pages.map((p) => ({ ...p, fields: { ...p.fields } })),
  );
  const [activeField, setActiveField] = useState<{
    pageIdx: number;
    fieldName: string;
  } | null>(null);

  const updateField = (pageIdx: number, key: string, value: string) => {
    setEditedPages((prev) =>
      prev.map((p, i) =>
        i === pageIdx ? { ...p, fields: { ...p.fields, [key]: value } } : p,
      ),
    );
  };

  const updateTableCell = (
    pageIdx: number,
    rowIdx: number,
    col: string,
    value: string,
  ) => {
    setEditedPages((prev) =>
      prev.map((p, i) =>
        i === pageIdx
          ? {
              ...p,
              table_rows: p.table_rows.map((row, ri) =>
                ri === rowIdx ? { ...row, [col]: value } : row,
              ),
            }
          : p,
      ),
    );
  };

  const exportJson = () => {
    const data = {
      template: result.template_name,
      template_type: result.template_type,
      extracted_at: new Date().toISOString(),
      pages: editedPages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extracted_${result.template_type}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">
            Extracted Data — {result.template_type}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {result.pages.length} page{result.pages.length !== 1 ? "s" : ""}{" "}
            processed · Click a field to highlight its location
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
      </div>

      {confirmed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-medium">
          Data confirmed and saved.
        </div>
      )}

      {editedPages.map((page, pageIdx) => (
        <ReviewPageCard
          key={page.page_number}
          page={page}
          pageIdx={pageIdx}
          fileId={fileId}
          activeField={
            activeField?.pageIdx === pageIdx ? activeField.fieldName : null
          }
          onUpdateField={updateField}
          onUpdateTableCell={updateTableCell}
          onFieldClick={(fieldName) =>
            setActiveField(fieldName ? { pageIdx, fieldName } : null)
          }
        />
      ))}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setConfirmed(true)}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Confirm & Save
        </button>
        <button
          onClick={exportJson}
          className="px-4 py-2.5 border rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  uploadResult,
  onDelete,
  onReview,
}: {
  template: Template;
  uploadResult?: UploadResult | null;
  onDelete: () => void;
  onReview: (result: ExtractionResult, fileId: string) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [detectedPages, setDetectedPages] = useState<DetectedPage[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const matchedPages = detectedPages
    ? detectedPages
        .filter((p) => p.template_id === template.id)
        .map((p) => p.page_number)
    : [];

  const handleDetect = async () => {
    if (!uploadResult) return;
    setDetecting(true);
    setError(null);
    setDetectedPages(null);
    const res = await detectDocType(uploadResult.file_id, [template.id]);
    setDetecting(false);
    if (res.success && res.data) {
      setDetectedPages(res.data.pages);
    } else {
      setError(res.error || "Detection failed");
    }
  };

  const handleExtract = async () => {
    if (!uploadResult) return;
    setExtracting(true);
    setError(null);
    setProgress(0);

    const pageCount =
      matchedPages.length > 0
        ? matchedPages.length
        : (uploadResult.page_count ?? 10);
    // ~5s per page with Opus, animate to 90% over that estimate
    const estimatedMs = Math.max(pageCount * 5000, 8000);
    const tickMs = 250;
    const increment = 90 / (estimatedMs / tickMs);

    const stages = [
      "Sending to Claude…",
      "Extracting fields…",
      "Processing tables…",
      "Finalising…",
    ];
    let tick = 0;
    progressTimer.current = setInterval(() => {
      tick++;
      setProgress((p) => Math.min(p + increment, 90));
      const stageIdx = Math.min(
        Math.floor(tick / (estimatedMs / tickMs / stages.length)),
        stages.length - 1,
      );
      setProgressStage(stages[stageIdx]);
    }, tickMs);

    const res = await extractTemplateData(
      template.id,
      uploadResult.file_id,
      matchedPages.length > 0 ? matchedPages : undefined,
    );

    if (progressTimer.current) clearInterval(progressTimer.current);
    setProgress(100);
    setProgressStage("Done!");

    setTimeout(() => {
      setExtracting(false);
      setProgress(0);
      setProgressStage("");
      if (res.success && res.data) {
        onReview(res.data, uploadResult.file_id);
      } else {
        setError(res.error || "Extraction failed");
      }
    }, 500);
  };

  return (
    <li className="border rounded-xl bg-white overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {template.name}
              </p>
              <span className="flex-shrink-0 text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
                {template.template_type}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {template.direct_link_fields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400 mr-1">Fields:</span>
                  {template.direct_link_fields.map((f) => (
                    <span
                      key={f}
                      className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {template.table_fields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400 mr-1">Table:</span>
                  {template.table_fields.map((f) => (
                    <span
                      key={f}
                      className="text-xs bg-green-50 text-green-600 rounded px-1.5 py-0.5"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {template.special_conditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-gray-400 mr-1">Rules:</span>
                  {template.special_conditions.map((c, i) => (
                    <span
                      key={i}
                      className="text-xs bg-amber-50 text-amber-600 rounded px-1.5 py-0.5"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
            title="Delete template"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {uploadResult && (
          <div className="flex gap-2">
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-full font-medium disabled:opacity-60 transition-colors"
            >
              {detecting ? "Detecting..." : "Detect in PDF"}
            </button>
            {detectedPages && (
              <button
                onClick={handleExtract}
                disabled={extracting}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full font-medium disabled:opacity-60 transition-colors"
              >
                {extracting
                  ? "Extracting..."
                  : matchedPages.length > 0
                    ? `Extract ${matchedPages.length} page${matchedPages.length !== 1 ? "s" : ""}`
                    : "Extract all pages"}
              </button>
            )}
          </div>
        )}

        {extracting && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{progressStage}</span>
              <span className="font-medium text-blue-600">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              Estimated{" "}
              {Math.max(
                1,
                Math.ceil(
                  (matchedPages.length > 0
                    ? matchedPages.length
                    : (uploadResult?.page_count ?? 10)) *
                    5 *
                    (1 - progress / 100),
                ),
              )}
              s remaining
            </p>
          </div>
        )}

        {error && <p className="text-red-600 text-xs">{error}</p>}

        {detectedPages && (
          <div className="text-xs rounded-lg bg-purple-50 border border-purple-100 px-3 py-2">
            {matchedPages.length > 0 ? (
              <span className="text-purple-700">
                Matched pages: <strong>{matchedPages.join(", ")}</strong>
              </span>
            ) : (
              <span className="text-gray-500">
                No pages matched this template in the uploaded PDF.
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function TemplatesPanel({ uploadResult }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [view, setView] = useState<View>("list");
  const [reviewResult, setReviewResult] = useState<ExtractionResult | null>(
    null,
  );
  const [reviewFileId, setReviewFileId] = useState<string>("");

  useEffect(() => {
    loadTemplates();
  }, []);

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

  const handleReview = (result: ExtractionResult, fileId: string) => {
    setReviewResult(result);
    setReviewFileId(fileId);
    setView("review");
  };

  if (view === "create") {
    return (
      <CreateForm onSaved={handleSaved} onCancel={() => setView("list")} />
    );
  }

  if (view === "review" && reviewResult) {
    return (
      <ReviewPanel
        result={reviewResult}
        fileId={reviewFileId}
        onClose={() => setView("list")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Document Templates</h3>
        <button
          onClick={() => setView("create")}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {!uploadResult && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Upload a PDF above to detect and extract data using a template.
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No templates yet.</p>
          <p className="text-xs mt-1">
            Create one to start extracting structured data from PDFs.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              uploadResult={uploadResult}
              onDelete={() => handleDelete(t.id)}
              onReview={handleReview}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
