"use client";

import { useState } from "react";
import { splitPdf, downloadUrl } from "@/lib/api";
import type { UploadResult } from "@/lib/api";
import PageGrid from "./PageGrid";

interface Props {
  uploadResult: UploadResult;
  file: File;
}

type SplitMode = "range" | "every_n" | "selected";

export default function SplitPanel({ uploadResult, file }: Props) {
  const [mode, setMode] = useState<SplitMode>("range");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(uploadResult.page_count);
  const [everyN, setEveryN] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ download_url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePage = (pn: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pn) ? next.delete(pn) : next.add(pn);
      return next;
    });
  };

  const handleSplit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const payload: Parameters<typeof splitPdf>[0] = { file_id: uploadResult.file_id, mode };
    if (mode === "range") { payload.start_page = startPage; payload.end_page = endPage; }
    if (mode === "every_n") payload.every_n = everyN;
    if (mode === "selected") payload.selected_pages = Array.from(selected).sort((a, b) => a - b);

    const res = await splitPdf(payload);
    setLoading(false);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || "Split failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["range", "every_n", "selected"] as SplitMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${mode === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {m === "range" ? "By Range" : m === "every_n" ? "Every N Pages" : "Selected Pages"}
          </button>
        ))}
      </div>

      {mode === "range" && (
        <div className="flex gap-4 items-end">
          <label className="flex flex-col gap-1 text-sm">
            From Page
            <input type="number" min={1} max={uploadResult.page_count} value={startPage}
              onChange={(e) => setStartPage(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 w-24 focus:ring-2 ring-blue-300 outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To Page
            <input type="number" min={1} max={uploadResult.page_count} value={endPage}
              onChange={(e) => setEndPage(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 w-24 focus:ring-2 ring-blue-300 outline-none" />
          </label>
        </div>
      )}

      {mode === "every_n" && (
        <label className="flex flex-col gap-1 text-sm">
          Pages per chunk
          <input type="number" min={1} value={everyN}
            onChange={(e) => setEveryN(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 w-24 focus:ring-2 ring-blue-300 outline-none" />
        </label>
      )}

      {mode === "selected" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            {selected.size} of {uploadResult.page_count} pages selected
            {" — "}
            <button className="text-blue-600 underline" onClick={() => setSelected(new Set(Array.from({ length: uploadResult.page_count }, (_, i) => i + 1)))}>
              Select all
            </button>{" · "}
            <button className="text-blue-600 underline" onClick={() => setSelected(new Set())}>Clear</button>
          </p>
          <PageGrid file={file} pageCount={uploadResult.page_count} selected={selected} onToggle={togglePage} />
        </div>
      )}

      <button
        onClick={handleSplit}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {loading ? "Splitting..." : "Split PDF"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && (
        <a
          href={downloadUrl(result.download_url)}
          download
          className="inline-flex items-center gap-2 text-green-700 font-medium underline"
        >
          Download Result
        </a>
      )}
    </div>
  );
}
