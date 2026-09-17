"use client";

import { useEffect, useState } from "react";
import {
  getFileRecords, getIntegrations, createIntegration, updateIntegration,
  deleteIntegration, testIntegration, pushToIntegration, exportFiles,
} from "@/lib/api";
import type { FieldMapping, FileRecord, Integration } from "@/lib/api";

type Tab = "export" | "integrations";

// Mirrors the template field data types (TemplatesPanel.tsx) so a mapped
// field can be cast to what the receiving API expects instead of always
// going out as whatever string the extractor produced.
const MAPPING_TYPES: FieldMapping["type"][] = ["Text", "Date", "Number", "Currency", "Boolean"];

const INTEGRATION_TYPES = [
  { value: "webhook", label: "Generic Webhook" },
  { value: "sap", label: "SAP" },
  { value: "cargowise", label: "CargoWise" },
  { value: "erp", label: "Custom ERP" },
  { value: "tms", label: "TMS" },
];

const AUTH_TYPES = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer Token" },
  { value: "api_key", label: "API Key (X-API-Key)" },
  { value: "basic", label: "Basic Auth (user:pass)" },
];

const TYPE_ICON: Record<string, string> = {
  webhook: "🔗",
  sap: "🏢",
  cargowise: "🚢",
  erp: "⚙️",
  tms: "🚛",
};

// ─── Integration modal ────────────────────────────────────────────────────

function IntegrationModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Integration;
  onSave: (i: Integration) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "webhook");
  const [endpointUrl, setEndpointUrl] = useState(initial?.endpoint_url ?? "");
  const [authType, setAuthType] = useState<Integration["auth_type"]>(initial?.auth_type ?? "none");
  const [authToken, setAuthToken] = useState(initial?.auth_token ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [payloadStyle, setPayloadStyle] = useState<Integration["payload_style"]>(initial?.payload_style ?? "wrapped");
  const [headersRaw, setHeadersRaw] = useState(
    Object.entries(initial?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")
  );
  const [mappingRows, setMappingRows] = useState<Array<{ source: string; target: string; type: FieldMapping["type"] }>>(
    Object.entries(initial?.field_mapping ?? {}).flatMap(([source, m]) =>
      (Array.isArray(m) ? m : [m]).map((entry) =>
        typeof entry === "string"
          ? { source, target: entry, type: "Text" as const }
          : { source, target: entry.target, type: entry.type }
      )
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"basic" | "auth" | "mapping">("basic");

  const parseHeaders = (): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const line of headersRaw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return result;
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!endpointUrl.trim()) { setError("Endpoint URL is required"); return; }
    setSaving(true);
    // Group by source field — a field mapped more than once (e.g. one "date"
    // field feeding both etd_sin and eta_sin) is stored as an array so every
    // row survives, instead of the later row silently overwriting the earlier
    // one under the same key.
    const grouped: Record<string, FieldMapping | FieldMapping[]> = {};
    for (const r of mappingRows) {
      if (!r.source.trim()) continue;
      const entry: FieldMapping = { target: r.target, type: r.type };
      const existing = grouped[r.source];
      if (existing === undefined) grouped[r.source] = entry;
      else if (Array.isArray(existing)) existing.push(entry);
      else grouped[r.source] = [existing, entry];
    }
    const payload = {
      name, type, endpoint_url: endpointUrl, auth_type: authType,
      auth_token: authToken, headers: parseHeaders(), description,
      field_mapping: grouped,
      payload_style: payloadStyle,
    };
    const res = initial
      ? await updateIntegration(initial.id, payload)
      : await createIntegration(payload);
    setSaving(false);
    if (res.success && res.data) onSave(res.data);
    else setError(res.error ?? "Save failed");
  };

  const sectionBtn = (key: typeof activeSection, label: string) => (
    <button onClick={() => setActiveSection(key)}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
        ${activeSection === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial ? "Edit Integration" : "New Integration"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 flex gap-2">
          {sectionBtn("basic", "Basic")}
          {sectionBtn("auth", "Authentication")}
          {sectionBtn("mapping", "Field Mapping")}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          {activeSection === "basic" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                    {INTEGRATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Endpoint URL</label>
                <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://your-system.com/api/webhook"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Payload format</label>
                <select value={payloadStyle} onChange={(e) => setPayloadStyle(e.target.value as Integration["payload_style"])}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                  <option value="wrapped">Wrapped — {"{ source, pushed_at, records: [...] }"} in one request</option>
                  <option value="flat">Flat — mapped fields as the top-level body, one request per record</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Use Flat for endpoints (e.g. a Bubble.io API workflow) that expect their own
                  parameters at the top level instead of nested under a batch envelope.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Custom Headers <span className="text-gray-400">(one per line, format: Key: Value)</span>
                </label>
                <textarea value={headersRaw} onChange={(e) => setHeadersRaw(e.target.value)} rows={3}
                  placeholder={"X-Tenant-ID: acme\nX-Source: ai-pdf"}
                  className="w-full border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-2 ring-blue-400 resize-none" />
              </div>
            </div>
          )}

          {activeSection === "auth" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Auth Type</label>
                <select value={authType} onChange={(e) => setAuthType(e.target.value as Integration["auth_type"])}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                  {AUTH_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {authType !== "none" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {authType === "basic" ? "Credentials (username:password)" : "Token / Key"}
                  </label>
                  <input value={authToken} onChange={(e) => setAuthToken(e.target.value)}
                    type="password"
                    placeholder={authType === "basic" ? "admin:secret" : "sk_live_…"}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 ring-blue-400" />
                </div>
              )}
              {authType === "none" && (
                <p className="text-xs text-gray-400 italic">No authentication — requests will be sent without credentials.</p>
              )}
            </div>
          )}

          {activeSection === "mapping" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Rename fields and set their data type for the outgoing payload — an extracted value is
                cast to that type (e.g. "897.272 LB" → the number 897.272) instead of always going out
                as a string. Leave the target name empty to keep the field's own name and only cast it.
                Add the same source field twice with different targets to send it to more than one key
                (e.g. one "Date" field feeding both etd_sin and eta_sin).
              </p>
              <div className="space-y-2">
                {mappingRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={row.source}
                      onChange={(e) => setMappingRows((p) => p.map((r, j) => j === i ? { ...r, source: e.target.value } : r))}
                      placeholder="Source field" className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400" />
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <input value={row.target}
                      onChange={(e) => setMappingRows((p) => p.map((r, j) => j === i ? { ...r, target: e.target.value } : r))}
                      placeholder="Target field (optional)" className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400" />
                    <select value={row.type}
                      onChange={(e) => setMappingRows((p) => p.map((r, j) => j === i ? { ...r, type: e.target.value as FieldMapping["type"] } : r))}
                      className="text-xs border rounded px-2 py-1.5 bg-white outline-none focus:ring-1 ring-blue-400 flex-shrink-0">
                      {MAPPING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setMappingRows((p) => p.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setMappingRows((p) => [...p, { source: "", target: "", type: "Text" }])}
                className="text-xs text-blue-600 border border-dashed border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors">
                + Add mapping
              </button>
            </div>
          )}
        </div>

        <div className="p-5 border-t flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Export tab ────────────────────────────────────────────────────────────

function ExportTab({ fileRecords }: { fileRecords: FileRecord[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<"csv" | "excel" | "json">("csv");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = fileRecords.filter(
    (f) => !search || f.filename.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((f) => f.id)));
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) { setError("Select at least one file"); return; }
    setExporting(true);
    setError(null);
    try {
      await exportFiles(format, ids);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
    setExporting(false);
  };

  const formatMeta = {
    csv:   { label: "CSV", desc: "Comma-separated, opens in Excel/Sheets", icon: "📄" },
    excel: { label: "Excel", desc: "Formatted .xlsx with styled headers", icon: "📊" },
    json:  { label: "JSON", desc: "Structured JSON for API consumption", icon: "{ }" },
  };

  return (
    <div className="space-y-5">
      {/* Format picker */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Export format</p>
        <div className="grid grid-cols-3 gap-3">
          {(["csv", "excel", "json"] as const).map((f) => (
            <button key={f} onClick={() => setFormat(f)}
              className={`border rounded-xl p-4 text-left transition-all
                ${format === f ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "hover:border-gray-300"}`}>
              <p className="text-xl mb-1">{formatMeta[f].icon}</p>
              <p className="text-sm font-semibold text-gray-800">{formatMeta[f].label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{formatMeta[f].desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* File selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-600">Select files ({selectedIds.size} selected)</p>
          <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
            {selectedIds.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="relative mb-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter files…"
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
        </div>
        <div className="border rounded-xl overflow-hidden divide-y max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No files yet.</p>
          ) : filtered.map((file) => (
            <label key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(file.id)} onChange={() => toggle(file.id)}
                className="rounded border-gray-300 text-blue-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{file.filename}</p>
                <p className="text-[10px] text-gray-400">
                  {file.template_name ?? "No template"} · {file.status} · {file.page_count}p
                </p>
              </div>
              {file.extracted_at && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Extracted</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <button onClick={handleExport} disabled={exporting || selectedIds.size === 0}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-blue-800 disabled:opacity-40 transition-colors">
        {exporting ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export {selectedIds.size > 0 ? `${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""}` : "files"} as {format.toUpperCase()}
          </>
        )}
      </button>
    </div>
  );
}

// ─── Integrations tab ─────────────────────────────────────────────────────

function IntegrationsTab({ fileRecords }: { fileRecords: FileRecord[] }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIntg, setEditingIntg] = useState<Integration | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [selectedPushIds, setSelectedPushIds] = useState<Set<string>>(new Set());
  const [pushTarget, setPushTarget] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getIntegrations();
    if (res.success && res.data) setIntegrations(res.data);
    setLoading(false);
  };

  const handleSaved = (intg: Integration) => {
    setIntegrations((prev) => {
      const idx = prev.findIndex((i) => i.id === intg.id);
      return idx >= 0 ? prev.map((i) => i.id === intg.id ? intg : i) : [...prev, intg];
    });
    setShowModal(false);
    setEditingIntg(null);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    const res = await testIntegration(id);
    setTestResult((prev) => ({
      ...prev,
      [id]: {
        success: res.success && !!res.data?.success,
        message: res.data
          ? `${res.data.success ? "✓" : "✗"} HTTP ${res.data.status_code} — ${res.data.response_body.slice(0, 80)}`
          : (res.error ?? "Failed"),
      },
    }));
    setTestingId(null);
  };

  const handlePush = async (id: string) => {
    const ids = Array.from(selectedPushIds);
    setPushingId(id);
    const res = await pushToIntegration(id, ids);
    setTestResult((prev) => ({
      ...prev,
      [id]: {
        success: res.success && !!res.data?.success,
        message: res.data
          ? `${res.data.success ? "✓" : "✗"} Pushed ${res.data.records_pushed} records — ${res.data.response_body.slice(0, 80)}`
          : (res.error ?? "Failed"),
      },
    }));
    setPushingId(null);
    setPushTarget(null);
    setSelectedPushIds(new Set());
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteIntegration(id);
    if (res.success) setIntegrations((prev) => prev.filter((i) => i.id !== id));
    setDeletingId(null);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Configure endpoints to push extracted data to external systems.</p>
          <button onClick={() => { setEditingIntg(null); setShowModal(true); }}
            className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
            + New Integration
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : integrations.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-14 text-center">
            <p className="text-2xl mb-2">🔌</p>
            <p className="text-sm text-gray-500">No integrations yet.</p>
            <p className="text-xs text-gray-400 mt-1">Connect to SAP, CargoWise, or any HTTP endpoint.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {integrations.map((intg) => (
              <div key={intg.id} className="border rounded-xl bg-white p-5 hover:border-blue-100 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{TYPE_ICON[intg.type] ?? "🔗"}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 text-sm">{intg.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                          ${intg.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {intg.active ? "Active" : "Inactive"}
                        </span>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                          {INTEGRATION_TYPES.find((t) => t.value === intg.type)?.label ?? intg.type}
                        </span>
                      </div>
                      {intg.description && <p className="text-xs text-gray-400 mt-0.5">{intg.description}</p>}
                      <p className="text-[10px] font-mono text-gray-400 mt-1 truncate max-w-xs">{intg.endpoint_url}</p>
                      {intg.last_pushed_at && (
                        <p className="text-[10px] text-gray-300 mt-0.5">
                          Last push: {new Date(intg.last_pushed_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingIntg(intg); setShowModal(true); }}
                      className="text-gray-400 hover:text-blue-600 transition-colors p-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button disabled={deletingId === intg.id} onClick={() => handleDelete(intg.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1.5 disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {testResult[intg.id] && (
                  <div className={`mt-3 text-xs px-3 py-2 rounded-lg border font-mono
                    ${testResult[intg.id].success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {testResult[intg.id].message}
                  </div>
                )}

                {/* Push file selector */}
                {pushTarget === intg.id && (
                  <div className="mt-3 border rounded-lg p-3 bg-gray-50 space-y-2">
                    <p className="text-xs font-medium text-gray-600">Select files to push:</p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {fileRecords.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox"
                            checked={selectedPushIds.has(f.id)}
                            onChange={() => setSelectedPushIds((prev) => {
                              const next = new Set(prev);
                              next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                              return next;
                            })}
                            className="rounded" />
                          <span className="text-xs text-gray-700 truncate">{f.filename}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{f.status}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handlePush(intg.id)}
                        disabled={pushingId === intg.id || selectedPushIds.size === 0}
                        className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
                        {pushingId === intg.id ? "Pushing…" : `Push ${selectedPushIds.size} file${selectedPushIds.size !== 1 ? "s" : ""}`}
                      </button>
                      <button onClick={() => { setPushTarget(null); setSelectedPushIds(new Set()); }}
                        className="text-xs text-gray-500 border rounded-lg px-3 py-1.5 hover:bg-gray-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleTest(intg.id)} disabled={testingId === intg.id}
                    className="text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {testingId === intg.id ? "Testing…" : "Test Connection"}
                  </button>
                  <button onClick={() => { setPushTarget(pushTarget === intg.id ? null : intg.id); setSelectedPushIds(new Set()); }}
                    className="text-xs border border-blue-300 text-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
                    Push Files →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <IntegrationModal
          initial={editingIntg ?? undefined}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditingIntg(null); }}
        />
      )}
    </>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export default function ExportPanel() {
  const [tab, setTab] = useState<Tab>("export");
  const [fileRecords, setFileRecords] = useState<FileRecord[]>([]);

  useEffect(() => {
    getFileRecords().then((res) => { if (res.success && res.data) setFileRecords(res.data); });
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-gray-800">Export & ERP Integration</h3>
        <p className="text-xs text-gray-400 mt-0.5">Download extracted data or push it to external systems.</p>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {([
          { key: "export" as Tab, label: "Export" },
          { key: "integrations" as Tab, label: "Integrations" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors
              ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "export" && <ExportTab fileRecords={fileRecords} />}
      {tab === "integrations" && <IntegrationsTab fileRecords={fileRecords} />}
    </div>
  );
}
