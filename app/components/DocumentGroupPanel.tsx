"use client";

import { useState } from "react";
import { groupDocuments, uploadPdf } from "@/lib/api";
import type { UploadResult, DocumentGroup } from "@/lib/api";
import FileUploadZone from "@/components/FileUploadZone";

const DOC_TYPE_COLORS: Record<string, string> = {
  "Commercial Invoice": "bg-amber-100 text-amber-800 border-amber-300",
  "Proforma Invoice":   "bg-amber-100 text-amber-800 border-amber-300",
  "Tax Invoice":        "bg-amber-100 text-amber-800 border-amber-300",
  "Bill of Lading":     "bg-blue-100 text-blue-800 border-blue-300",
  "Air Waybill":        "bg-sky-100 text-sky-800 border-sky-300",
  "Packing List":       "bg-green-100 text-green-800 border-green-300",
  "Certificate of Origin": "bg-purple-100 text-purple-800 border-purple-300",
  "Delivery Order":     "bg-teal-100 text-teal-800 border-teal-300",
  "Customs Permit":     "bg-orange-100 text-orange-800 border-orange-300",
  "Insurance Certificate": "bg-pink-100 text-pink-800 border-pink-300",
};

function docTypeColor(type: string) {
  return DOC_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700 border-gray-300";
}

function pageRange(pages: number[]) {
  if (pages.length === 0) return "—";
  if (pages.length === 1) return `Page ${pages[0]}`;
  const sorted = [...pages].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // Check if contiguous
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  if (contiguous) return `Pages ${first}–${last}`;
  return `Pages ${sorted.join(", ")}`;
}

function DocumentCard({ doc, index }: { doc: DocumentGroup; index: number }) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-shadow hover:shadow-md ${
        doc.is_invoice
          ? "border-amber-300 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {doc.is_invoice && (
            <span className="text-xs font-bold text-amber-700 bg-amber-200 rounded px-1.5 py-0.5 uppercase tracking-wide">
              Invoice
            </span>
          )}
          <span
            className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${docTypeColor(doc.document_type)}`}
          >
            {doc.document_type}
          </span>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5 font-medium">
          {pageRange(doc.pages)}
        </span>
      </div>

      {/* Reference */}
      {doc.reference && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          </span>
          <span className="text-sm font-mono text-gray-700 font-medium">{doc.reference}</span>
        </div>
      )}

      {/* Customer */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-blue-400 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">Customer</p>
          <p className="text-sm text-gray-800 font-semibold">
            {doc.customer ?? <span className="text-gray-400 font-normal italic">Not identified</span>}
          </p>
        </div>
      </div>

      {/* Agent */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-purple-400 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">Agent / Issuer</p>
          <p className="text-sm text-gray-800 font-semibold">
            {doc.agent ?? <span className="text-gray-400 font-normal italic">Not identified</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DocumentGroupPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!uploadResult) {
    return (
      <div className="space-y-2">
        <FileUploadZone onFiles={handleFileUpload} multiple={false} uploading={uploading} />
        {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}
      </div>
    );
  }

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setDocuments(null);
    const res = await groupDocuments(uploadResult.file_id);
    setLoading(false);
    if (res.success && res.data) {
      setDocuments(res.data.documents);
    } else {
      setError(res.error || "Analysis failed");
    }
  };

  const invoiceCount = documents?.filter((d) => d.is_invoice).length ?? 0;
  const otherCount = (documents?.length ?? 0) - invoiceCount;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
        <span className="truncate">{file?.name} · {uploadResult.page_count} page{uploadResult.page_count === 1 ? "" : "s"}</span>
        <button onClick={() => { setFile(null); setUploadResult(null); setDocuments(null); }} className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-3">
          Choose a different file
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Document Analysis</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Identifies related pages, customer, agent, and prioritises invoices
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analysing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Analyse Documents
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center space-y-2">
          <p className="text-sm font-medium text-blue-700">Claude is reading your PDF…</p>
          <p className="text-xs text-blue-500">
            Grouping related pages · identifying customers & agents · prioritising invoices
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {documents && (
        <>
          {/* Summary strip */}
          <div className="flex gap-3 text-sm">
            <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center">
              <p className="text-2xl font-bold text-amber-700">{invoiceCount}</p>
              <p className="text-xs text-amber-600 font-medium">Invoice{invoiceCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
              <p className="text-2xl font-bold text-gray-700">{otherCount}</p>
              <p className="text-xs text-gray-500 font-medium">Other doc{otherCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center">
              <p className="text-2xl font-bold text-blue-700">{uploadResult.page_count}</p>
              <p className="text-xs text-blue-500 font-medium">Total page{uploadResult.page_count !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Invoice section */}
          {invoiceCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Invoices
                </span>
                <div className="flex-1 h-px bg-amber-200" />
              </div>
              {documents
                .filter((d) => d.is_invoice)
                .map((doc, i) => (
                  <DocumentCard key={doc.document_number} doc={doc} index={i} />
                ))}
            </div>
          )}

          {/* Other documents section */}
          {otherCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Other Documents
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {documents
                .filter((d) => !d.is_invoice)
                .map((doc, i) => (
                  <DocumentCard key={doc.document_number} doc={doc} index={i} />
                ))}
            </div>
          )}
        </>
      )}

      {!loading && !documents && !error && (
        <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-gray-400 text-sm">
          Click <span className="font-medium text-gray-600">Analyse Documents</span> to group pages and identify customers, agents, and invoices.
        </div>
      )}
    </div>
  );
}
