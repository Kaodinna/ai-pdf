"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldPosition } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let _pdfjs: typeof import("pdfjs-dist") | null = null;
const _pdfDocCache = new Map<string, import("pdfjs-dist").PDFDocumentProxy>();

async function getPdfJs() {
  if (!_pdfjs) {
    _pdfjs = await import("pdfjs-dist");
    _pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${_pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return _pdfjs;
}

export async function getPdfDoc(cacheKey: string, url?: string) {
  if (_pdfDocCache.has(cacheKey)) return _pdfDocCache.get(cacheKey)!;
  const lib = await getPdfJs();
  const doc = await lib.getDocument({ url: url ?? `${API_BASE}/preview/${cacheKey}`, withCredentials: true }).promise;
  _pdfDocCache.set(cacheKey, doc);
  return doc;
}

// ─── File thumbnail ─────────────────────────────────────────────────────
// Small rendered preview of page 1, for use in file lists. Falls back to a
// plain document icon while loading or if the file can't be rendered.

const _thumbnailCache = new Map<string, string>();

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-4 h-4 text-gray-400 flex-shrink-0"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export function FileThumbnail({
  fileId,
  className,
}: {
  fileId: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(_thumbnailCache.get(fileId) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src || failed) return;
    let cancelled = false;

    (async () => {
      try {
        const pdf = await getPdfDoc(fileId);
        const page = await pdf.getPage(1);
        const baseVp = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const scale = (48 * dpr) / baseVp.height; // render near the display size (at device resolution), not full-page
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        _thumbnailCache.set(fileId, dataUrl);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [fileId, src, failed]);

  if (!src) return <DocumentIcon className={className} />;
  return (
    <img
      src={src}
      alt=""
      className={className ?? "w-6 h-8 object-cover rounded-sm border border-gray-200 flex-shrink-0 bg-white"}
    />
  );
}

// ─── PDF page viewer with highlight overlay ────────────────────────────────
// Renders one page of an already-uploaded document (by file_id, via the
// /preview endpoint) and, when a field's extracted position is known,
// overlays a highlight box so the original document and the extracted value
// can be cross-referenced directly.

export function PdfPageViewer({
  fileId,
  sourceUrl,
  pageNumber,
  activeField = null,
  fieldPositions = {},
  pageWidth = 0,
  pageHeight = 0,
  onLoaded,
}: {
  fileId: string;
  sourceUrl?: string; // overrides the default /preview/{fileId} URL — used for files outside the normal upload store (e.g. split outputs)
  pageNumber: number;
  activeField?: string | null;
  fieldPositions?: Record<string, FieldPosition>;
  pageWidth?: number;
  pageHeight?: number;
  onLoaded?: (numPages: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setRendered(false);
    setLoadError(null);

    const render = async () => {
      try {
        if (cancelled) return;
        const pdf = await getPdfDoc(fileId, sourceUrl);
        if (cancelled) return;
        onLoaded?.(pdf.numPages);
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;
        const containerW = container.clientWidth || 400;
        const baseVp = page.getViewport({ scale: 1 });
        const cssScale = containerW / baseVp.width;
        // Render at device-pixel resolution (Retina/HiDPI is 2x+) but keep the
        // on-page CSS size the same — otherwise the canvas looks soft/blurry
        // on any high-DPI display, which is most of them these days.
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: cssScale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${containerW}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setLoadError("Canvas 2D context unavailable"); return; }
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    };

    render();
    return () => { cancelled = true; };
  }, [fileId, sourceUrl, pageNumber]);

  const rawHighlight = activeField ? fieldPositions[activeField] : null;
  const highlight =
    rawHighlight && rawHighlight.x1 > rawHighlight.x0 && rawHighlight.y1 > rawHighlight.y0
      ? rawHighlight
      : null;

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlight]);

  return (
    <div ref={containerRef} className="relative w-full bg-gray-100 min-h-[200px]">
      <canvas ref={canvasRef} className="w-full block" />
      {!rendered && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
          Loading page…
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <p className="text-xs text-red-500 text-center bg-white rounded p-2 shadow-sm">{loadError}</p>
        </div>
      )}
      {rendered && pageWidth > 0 && (
        <div
          ref={highlightRef}
          className="absolute pointer-events-none"
          style={{
            left: highlight ? `calc(${(highlight.x0 / pageWidth) * 100}% - 3px)` : 0,
            top: highlight ? `calc(${(highlight.y0 / pageHeight) * 100}% - 3px)` : 0,
            width: highlight ? `calc(${((highlight.x1 - highlight.x0) / pageWidth) * 100}% + 6px)` : 0,
            height: highlight ? `calc(${((highlight.y1 - highlight.y0) / pageHeight) * 100}% + 6px)` : 0,
            backgroundColor: "rgba(255, 200, 0, 0.55)",
            border: highlight ? "3px solid #e67e00" : "none",
            borderRadius: "3px",
            boxShadow: highlight ? "0 0 0 2px rgba(230, 126, 0, 0.35), 0 2px 8px rgba(0,0,0,0.25)" : "none",
            opacity: highlight ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
        />
      )}
    </div>
  );
}
