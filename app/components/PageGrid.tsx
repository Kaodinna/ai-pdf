"use client";

import { useEffect, useState } from "react";
import { renderPageThumbnail } from "@/lib/pdfUtils";

interface PageGridProps {
  file: File;
  pageCount: number;
  selected: Set<number>;
  onToggle: (pageNum: number) => void;
}

export default function PageGrid({ file, pageCount, selected, onToggle }: PageGridProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  useEffect(() => {
    setThumbnails({});
    let cancelled = false;

    async function loadThumbs() {
      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) break;
        try {
          const dataUrl = await renderPageThumbnail(file, i, 0.35);
          if (!cancelled) setThumbnails((prev) => ({ ...prev, [i]: dataUrl }));
        } catch {}
      }
    }
    loadThumbs();
    return () => { cancelled = true; };
  }, [file, pageCount]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto p-1">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pn) => (
        <button
          key={pn}
          onClick={() => onToggle(pn)}
          className={`relative rounded-lg overflow-hidden border-2 transition-all
            ${selected.has(pn) ? "border-blue-500 ring-2 ring-blue-300" : "border-gray-200 hover:border-gray-400"}`}
        >
          {thumbnails[pn] ? (
            <img src={thumbnails[pn]} alt={`Page ${pn}`} className="w-full h-auto" />
          ) : (
            <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center">
              <span className="text-xs text-gray-400">Loading...</span>
            </div>
          )}
          <span className={`absolute bottom-0 left-0 right-0 text-xs py-0.5 text-center font-medium
            ${selected.has(pn) ? "bg-blue-500 text-white" : "bg-black/40 text-white"}`}>
            {pn}
          </span>
          {selected.has(pn) && (
            <span className="absolute top-1 right-1 bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
