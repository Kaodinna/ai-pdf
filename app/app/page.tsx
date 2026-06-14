"use client";

import { useState } from "react";
import { uploadPdf } from "@/lib/api";
import type { UploadResult } from "@/lib/api";
import FileUploadZone from "@/components/FileUploadZone";
import SplitPanel from "@/components/SplitPanel";
import MergePanel from "@/components/MergePanel";
import AICommandBar from "@/components/AICommandBar";
import TemplatesPanel from "@/components/TemplatesPanel";
import ShippingPanel from "@/components/ShippingPanel";

type Tab = "split" | "merge" | "ai" | "templates" | "shipping";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("split");

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    setFile(f);
    const res = await uploadPdf(f);
    setUploading(false);
    if (res.success && res.data) {
      setUploadResult(res.data);
    } else {
      setUploadError(res.error || "Upload failed");
      setFile(null);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "split", label: "Split" },
    { key: "merge", label: "Merge" },
    { key: "ai", label: "AI Commands" },
    { key: "templates", label: "Templates" },
    { key: "shipping", label: "Shipping Docs" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b shadow-sm">
        <div className="px-6 py-4 flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">AI PDF Studio</h1>
            <p className="text-xs text-gray-500">Split, merge, and extract with AI</p>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <h2 className="font-semibold text-gray-700">Upload PDF</h2>
          {!uploadResult ? (
            <>
              <FileUploadZone onFiles={handleFile} multiple={false} uploading={uploading} />
              {uploading && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Uploading and analyzing PDF...
                </div>
              )}
              {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}
            </>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="bg-blue-600 text-white p-3 rounded-lg">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{uploadResult.filename}</p>
                <p className="text-sm text-gray-500">
                  {uploadResult.page_count} pages · {formatBytes(uploadResult.size_bytes)}
                </p>
              </div>
              <button
                onClick={() => { setUploadResult(null); setFile(null); }}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                Change
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex border-b">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-sm font-medium transition-colors
                  ${tab === t.key
                    ? "bg-white text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-500 hover:text-gray-700 bg-gray-50"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "split" && (
              uploadResult && file ? (
                <SplitPanel uploadResult={uploadResult} file={file} />
              ) : (
                <p className="text-gray-400 text-sm italic">Upload a PDF above to use the splitter.</p>
              )
            )}
            {tab === "merge" && <MergePanel />}
            {tab === "ai" && (
              uploadResult ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Describe what to do with <span className="font-medium text-gray-700">{uploadResult.filename}</span> in plain English.
                  </p>
                  <AICommandBar uploadResult={uploadResult} />
                </div>
              ) : (
                <p className="text-gray-400 text-sm italic">Upload a PDF above to use AI commands.</p>
              )
            )}
            {tab === "templates" && <TemplatesPanel uploadResult={uploadResult} />}
            {tab === "shipping" && <ShippingPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
