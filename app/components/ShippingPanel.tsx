"use client";

import { useState } from "react";
import {
  uploadPdf,
  extractShippingData,
  separateShippingDocs,
  downloadUrl,
} from "@/lib/api";
import type { ShippingRecord, ShippingGroupResult } from "@/lib/api";
import FileUploadZone from "./FileUploadZone";

const DOC_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Bill of Lading":        { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",  dot: "bg-blue-500"   },
  "Air Waybill":           { bg: "bg-sky-50",    text: "text-sky-700",    border: "border-sky-200",   dot: "bg-sky-500"    },
  "Commercial Invoice":    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Packing List":          { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200", dot: "bg-amber-500"  },
  "Certificate of Origin": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200",dot: "bg-orange-500" },
  "Delivery Order":        { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200",dot: "bg-violet-500" },
  "Customs Permit":        { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",   dot: "bg-red-500"    },
  "Insurance Certificate": { bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200",  dot: "bg-teal-500"   },
  "Other":                 { bg: "bg-gray-50",   text: "text-gray-600",   border: "border-gray-200",  dot: "bg-gray-400"   },
};

function getDocColor(type: string | null) {
  return DOC_COLORS[type || "Other"] || DOC_COLORS["Other"];
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function DocTypePill({ type }: { type: string | null }) {
  const c = getDocColor(type);
  const label = type || "Other";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

function val(v: string | null | string[] | undefined) {
  if (!v) return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return v.trim() || null;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-xs text-gray-400 shrink-0 w-28">{label}</span>
      <span className="text-xs font-medium text-gray-800 break-words">{value}</span>
    </div>
  );
}

function RecordCard({ record }: { record: ShippingRecord }) {
  const [expanded, setExpanded] = useState(false);
  const c = getDocColor(record.document_type);

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden bg-white`}>
      {/* Card header */}
      <div className={`${c.bg} px-4 py-3 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-gray-400 shrink-0">p.{record.page_number}</span>
          <DocTypePill type={record.document_type} />
          {record.bl_number && (
            <span className="text-xs font-mono font-semibold text-gray-700 truncate">
              {record.bl_number}
            </span>
          )}
          {record.awb_number && (
            <span className="text-xs font-mono font-semibold text-gray-700 truncate">
              {record.awb_number}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-800 shrink-0 flex items-center gap-1"
        >
          {expanded ? "Less" : "More"}
          <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Always-visible key fields */}
      <div className="px-4 py-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
        {val(record.shipper_name) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Shipper</span>
            <span className="text-sm font-semibold text-gray-800 truncate">{val(record.shipper_name)}</span>
            {val(record.shipper_uen) && <span className="text-xs text-gray-400">UEN: {val(record.shipper_uen)}</span>}
          </div>
        )}
        {val(record.consignee_name) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Consignee</span>
            <span className="text-sm font-semibold text-gray-800 truncate">{val(record.consignee_name)}</span>
          </div>
        )}
        {(val(record.port_of_loading) || val(record.port_of_discharge)) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Route</span>
            <span className="text-sm font-medium text-gray-800">
              {val(record.port_of_loading) || "—"} → {val(record.port_of_discharge) || "—"}
            </span>
          </div>
        )}
        {record.container_numbers.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Container(s)</span>
            <div className="flex flex-wrap gap-1">
              {record.container_numbers.map(c => (
                <span key={c} className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{c}</span>
              ))}
            </div>
          </div>
        )}
        {val(record.vessel_name) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Vessel</span>
            <span className="text-sm font-medium text-gray-800">{val(record.vessel_name)} {val(record.voyage_number) ? `/ ${val(record.voyage_number)}` : ""}</span>
          </div>
        )}
        {val(record.description_of_goods) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Goods</span>
            <span className="text-sm text-gray-700 truncate">{val(record.description_of_goods)}</span>
          </div>
        )}
        {(val(record.gross_weight) || val(record.number_of_packages)) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Weight / Qty</span>
            <span className="text-sm text-gray-700">
              {[val(record.gross_weight), val(record.number_of_packages)].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
        {val(record.total_value) && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Value</span>
            <span className="text-sm font-semibold text-gray-800">
              {val(record.currency) ? `${val(record.currency)} ` : ""}{val(record.total_value)}
            </span>
          </div>
        )}
      </div>

      {/* Expanded detail rows */}
      {expanded && (
        <div className="border-t px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/60">
          <InfoRow label="Notify Party"       value={val(record.notify_party)} />
          <InfoRow label="Shipper Address"    value={val(record.shipper_address)} />
          <InfoRow label="Consignee Address"  value={val(record.consignee_address)} />
          <InfoRow label="Place of Delivery"  value={val(record.place_of_delivery)} />
          <InfoRow label="HS Code"            value={val(record.hs_code)} />
          <InfoRow label="Net Weight"         value={val(record.net_weight)} />
          <InfoRow label="Package Type"       value={val(record.package_type)} />
          <InfoRow label="Incoterms"          value={val(record.incoterms)} />
          <InfoRow label="Freight Terms"      value={val(record.freight_terms)} />
          <InfoRow label="Shipment Date"      value={val(record.shipment_date)} />
          <InfoRow label="ETA"                value={val(record.eta)} />
          <InfoRow label="Country of Origin"  value={val(record.country_of_origin)} />
          <InfoRow label="TradeNet Permit"    value={val(record.tradenet_permit)} />
          <InfoRow label="GST Registration"   value={val(record.gst_registration)} />
          <InfoRow label="Seal Numbers"       value={val(record.seal_numbers)} />
          <InfoRow label="Marks & Numbers"    value={val(record.marks_and_numbers)} />
          <InfoRow label="Flight Number"      value={val(record.flight_number)} />
          <InfoRow label="Remarks"            value={val(record.remarks)} />
        </div>
      )}
    </div>
  );
}

function GroupCard({ label, result }: { label: string; result: ShippingGroupResult }) {
  return (
    <div className="bg-white border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-800 text-sm leading-snug">{label}</p>
        <a
          href={downloadUrl(result.download_url)}
          download
          className="shrink-0 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Download
        </a>
      </div>
      <div className="flex flex-wrap gap-1">
        {result.pages.map(p => (
          <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
            p.{p}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-400">{result.pages.length} page{result.pages.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

export default function ShippingPanel() {
  const [fileId, setFileId]     = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [uploading, setUploading]   = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [records, setRecords]   = useState<ShippingRecord[] | null>(null);
  const [separating, setSeparating] = useState(false);
  const [groups, setGroups]     = useState<Record<string, ShippingGroupResult> | null>(null);
  const [zipUrl, setZipUrl]     = useState<string | null>(null);
  const [activeGroupBy, setActiveGroupBy] = useState<"company" | "container" | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(true);
    setError(null);
    setRecords(null);
    setGroups(null);
    setZipUrl(null);
    const res = await uploadPdf(f);
    setUploading(false);
    if (res.success && res.data) { setFileId(res.data.file_id); setFilename(f.name); }
    else setError(res.error || "Upload failed");
  };

  const handleExtract = async () => {
    if (!fileId) return;
    setExtracting(true);
    setError(null);
    setRecords(null);
    setGroups(null);
    setZipUrl(null);
    const res = await extractShippingData(fileId);
    setExtracting(false);
    if (res.success && res.data) setRecords(res.data.records);
    else setError(res.error || "Extraction failed");
  };

  const handleSeparate = async (groupBy: "company" | "container") => {
    if (!fileId || !records) return;
    setSeparating(true);
    setError(null);
    setGroups(null);
    setActiveGroupBy(groupBy);
    const res = await separateShippingDocs(fileId, groupBy, records);
    setSeparating(false);
    if (res.success && res.data) { setGroups(res.data.groups); setZipUrl(res.data.zip_url); }
    else setError(res.error || "Separation failed");
  };

  const reset = () => {
    setFileId(null); setFilename(""); setRecords(null);
    setGroups(null); setZipUrl(null); setActiveGroupBy(null); setError(null);
  };

  // ---- summary stats ----
  const docTypeCounts = records
    ? records.reduce<Record<string, number>>((a, r) => {
        const t = r.document_type || "Other";
        a[t] = (a[t] || 0) + 1;
        return a;
      }, {})
    : {};

  const uniqueCompanies = records
    ? new Set(records.map(r => r.company_key || r.shipper_name || r.consignee_name).filter(Boolean)).size
    : 0;

  const uniqueContainers = records
    ? new Set(records.flatMap(r => r.container_numbers)).size
    : 0;

  return (
    <div className="space-y-6">

      {/* ── Upload bar ── */}
      {!fileId ? (
        <FileUploadZone onFiles={handleFile} multiple={false} uploading={uploading} />
      ) : (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{filename}</span>
          {!records && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="shrink-0 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            >
              {extracting ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Extracting…
                </>
              ) : "Extract Data"}
            </button>
          )}
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Change</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* ── Dashboard ── */}
      {records && (
        <div className="space-y-6">

          {/* Stat row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Pages Analysed"    value={records.length} />
            <StatCard label="Document Types"    value={Object.keys(docTypeCounts).length} sub={Object.keys(docTypeCounts).join(", ")} />
            <StatCard label="Unique Companies"  value={uniqueCompanies} />
            <StatCard label="Containers Found"  value={uniqueContainers} />
          </div>

          {/* Doc-type breakdown bar */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Document Breakdown</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(docTypeCounts).map(([type, count]) => {
                const c = getDocColor(type);
                return (
                  <div key={type} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${c.bg} ${c.border}`}>
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    <span className={`text-sm font-medium ${c.text}`}>{type}</span>
                    <span className={`text-xs font-bold ${c.text} opacity-70`}>×{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Separation controls */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Separate into PDFs</h3>
                <p className="text-xs text-gray-400 mt-0.5">Split pages into individual files by company or container</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleSeparate("company")} disabled={separating}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors">
                  {separating && activeGroupBy === "company" ? "Working…" : "By Company"}
                </button>
                <button onClick={() => handleSeparate("container")} disabled={separating}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {separating && activeGroupBy === "container" ? "Working…" : "By Container"}
                </button>
              </div>
            </div>

            {groups && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {Object.keys(groups).length} group{Object.keys(groups).length !== 1 ? "s" : ""} by {activeGroupBy}
                  </p>
                  {zipUrl && (
                    <a href={downloadUrl(zipUrl)} download
                      className="text-xs font-semibold text-green-700 hover:underline flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Download all as ZIP
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(groups).map(([label, result]) => (
                    <GroupCard key={label} label={label} result={result} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Per-page records */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Extracted Records</h3>
            {records.map((r, i) => <RecordCard key={i} record={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}
