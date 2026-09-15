"use client";

import { useState } from "react";
import { uploadPdf, splitPdf, promoteSplitOutput, suggestTemplate, extractTemplateData, downloadUrl } from "@/lib/api";
import type { UploadResult } from "@/lib/api";
import PageGrid from "./PageGrid";
import { PdfPageViewer } from "./PdfPageViewer";
import FileUploadZone from "./FileUploadZone";

interface Props {
  onProcessed?: (fileIds: string[]) => void;
}

type SplitMode = "range" | "every_n" | "selected";

interface SplitOutput {
  filename: string;
  label: string;
}

interface SplitResult {
  outputs: SplitOutput[];
  zipDownloadUrl?: string; // only set for every_n with more than one part
}

type ProcessStatus = "idle" | "working" | "done" | "error";

export default function SplitPanel({ onProcessed }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [mode, setMode] = useState<SplitMode>("range");
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [everyN, setEveryN] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeIdx, setActiveIdx] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewNumPages, setPreviewNumPages] = useState(1);

  const [statuses, setStatuses] = useState<Record<string, ProcessStatus>>({});
  const [processError, setProcessError] = useState<string | null>(null);
  const [processingAll, setProcessingAll] = useState(false);

  const togglePage = (pn: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(pn) ? next.delete(pn) : next.add(pn);
      return next;
    });
  };

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
      setStartPage(1);
      setEndPage(res.data.page_count);
      setSelected(new Set());
      setResult(null);
    } else {
      setUploadError(res.error || "Upload failed");
    }
  };

  const handleChangeFile = () => {
    setFile(null);
    setUploadResult(null);
    setResult(null);
    setError(null);
  };

  if (!file || !uploadResult) {
    return (
      <div className="space-y-4">
        <FileUploadZone onFiles={handleFileUpload} multiple={false} uploading={uploading} />
        {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}
      </div>
    );
  }

  const handleSplit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setStatuses({});
    setProcessError(null);
    setActiveIdx(0);
    setPreviewPage(1);

    const payload: Parameters<typeof splitPdf>[0] = { file_id: uploadResult.file_id, mode };
    if (mode === "range") { payload.start_page = startPage; payload.end_page = endPage; }
    if (mode === "every_n") payload.every_n = everyN;
    if (mode === "selected") payload.selected_pages = Array.from(selected).sort((a, b) => a - b);

    const res = await splitPdf(payload);
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error || "Split failed");
      return;
    }

    const files = res.data.files;
    const outputs: SplitOutput[] = files.map((filename, i) => ({
      filename,
      label:
        mode === "every_n" ? `Part ${i + 1}`
          : mode === "selected" ? `Selected Pages (${selected.size})`
            : `Pages ${startPage}–${endPage}`,
    }));
    const zipDownloadUrl = mode === "every_n" && files.length > 1 ? res.data.download_url : undefined;
    setResult({ outputs, zipDownloadUrl });
  };

  const active = result?.outputs[activeIdx];

  const promoteAndExtract = async (output: SplitOutput): Promise<string> => {
    const promoteRes = await promoteSplitOutput(output.filename, `${output.label} — ${file.name}`);
    if (!promoteRes.success || !promoteRes.data) {
      throw new Error(promoteRes.error ?? "Failed to save split output");
    }
    const fileId = promoteRes.data.file_id;
    const suggestRes = await suggestTemplate(fileId);
    if (suggestRes.success && suggestRes.data?.template_id) {
      await extractTemplateData(suggestRes.data.template_id, fileId);
    }
    return fileId;
  };

  const handleProcessSelected = async () => {
    if (!active) return;
    setProcessError(null);
    setStatuses((prev) => ({ ...prev, [active.filename]: "working" }));
    try {
      const fileId = await promoteAndExtract(active);
      setStatuses((prev) => ({ ...prev, [active.filename]: "done" }));
      onProcessed?.([fileId]);
    } catch (e) {
      setStatuses((prev) => ({ ...prev, [active.filename]: "error" }));
      setProcessError(e instanceof Error ? e.message : "Processing failed");
    }
  };

  const handleProcessAll = async () => {
    if (!result) return;
    setProcessingAll(true);
    setProcessError(null);
    const fileIds: string[] = [];
    for (const output of result.outputs) {
      setStatuses((prev) => ({ ...prev, [output.filename]: "working" }));
      try {
        const fileId = await promoteAndExtract(output);
        fileIds.push(fileId);
        setStatuses((prev) => ({ ...prev, [output.filename]: "done" }));
      } catch (e) {
        setStatuses((prev) => ({ ...prev, [output.filename]: "error" }));
        setProcessError(e instanceof Error ? e.message : "Some documents failed to process");
      }
    }
    setProcessingAll(false);
    if (fileIds.length > 0) onProcessed?.(fileIds);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
        <span className="truncate">{file.name} · {uploadResult.page_count} page{uploadResult.page_count === 1 ? "" : "s"}</span>
        <button onClick={handleChangeFile} className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-3">
          Choose a different file
        </button>
      </div>

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
        <div className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700">
              Split into {result.outputs.length} document{result.outputs.length === 1 ? "" : "s"}
            </h4>
            <div className="flex items-center gap-3">
              {result.zipDownloadUrl && (
                <a href={downloadUrl(result.zipDownloadUrl)} download className="text-xs text-blue-600 hover:underline">
                  Download all as ZIP
                </a>
              )}
              <button onClick={handleProcessAll} disabled={processingAll}
                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {processingAll ? "Processing…" : `Process all ${result.outputs.length}`}
              </button>
            </div>
          </div>

          {processError && (
            <p className="text-xs text-red-600 bg-red-50 border-b border-red-200 px-4 py-2">{processError}</p>
          )}

          <div className="flex" style={{ height: "560px" }}>
            {/* Column 1 — list of split documents */}
            <div className="w-56 flex-shrink-0 border-r overflow-y-auto">
              {result.outputs.map((output, i) => {
                const status = statuses[output.filename] ?? "idle";
                return (
                  <button key={output.filename} onClick={() => { setActiveIdx(i); setPreviewPage(1); }}
                    className={`w-full text-left px-3 py-2.5 border-b text-sm flex items-center justify-between transition-colors
                      ${i === activeIdx ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
                    <span className="truncate">{output.label}</span>
                    {status === "working" && <span className="text-[10px] text-blue-500 flex-shrink-0 ml-1">…</span>}
                    {status === "done" && <span className="text-[10px] text-green-600 flex-shrink-0 ml-1">✓</span>}
                    {status === "error" && <span className="text-[10px] text-red-500 flex-shrink-0 ml-1">!</span>}
                  </button>
                );
              })}
            </div>

            {/* Column 2 — preview of the selected document */}
            <div className="flex-1 flex flex-col min-w-0">
              {active && (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-600 truncate">{active.label}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {previewNumPages > 1 && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <button onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage <= 1}
                            className="px-1.5 py-0.5 border rounded disabled:opacity-30 hover:bg-gray-100">‹</button>
                          {previewPage} / {previewNumPages}
                          <button onClick={() => setPreviewPage((p) => Math.min(previewNumPages, p + 1))} disabled={previewPage >= previewNumPages}
                            className="px-1.5 py-0.5 border rounded disabled:opacity-30 hover:bg-gray-100">›</button>
                        </div>
                      )}
                      <a href={downloadUrl(`/download/${active.filename}`)} download
                        className="text-xs text-blue-600 hover:underline">
                        Download
                      </a>
                      <button onClick={handleProcessSelected} disabled={statuses[active.filename] === "working"}
                        className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {statuses[active.filename] === "working" ? "Processing…" : "Process this document"}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-gray-100">
                    <PdfPageViewer
                      fileId={`split-output:${active.filename}`}
                      sourceUrl={downloadUrl(`/download/${active.filename}`)}
                      pageNumber={previewPage}
                      onLoaded={setPreviewNumPages}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
