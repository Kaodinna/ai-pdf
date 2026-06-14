"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { uploadPdf, mergePdfs, downloadUrl } from "@/lib/api";
import type { UploadResult } from "@/lib/api";
import FileUploadZone from "./FileUploadZone";

interface FileEntry {
  file: File;
  uploadResult: UploadResult;
}

export default function MergePanel() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [skipBlank, setSkipBlank] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ download_url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    setUploading(true);
    setError(null);
    for (const file of files) {
      const res = await uploadPdf(file);
      if (res.success && res.data) {
        setEntries((prev) => [...prev, { file, uploadResult: res.data! }]);
      } else {
        setError(`Failed to upload ${file.name}: ${res.error}`);
      }
    }
    setUploading(false);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(entries);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setEntries(items);
  };

  const remove = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index));

  const handleMerge = async () => {
    if (entries.length < 1) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await mergePdfs({
      file_ids: entries.map((e) => e.uploadResult.file_id),
      skip_blank: skipBlank,
    });
    setLoading(false);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || "Merge failed");
    }
  };

  return (
    <div className="space-y-4">
      <FileUploadZone onFiles={handleFiles} multiple uploading={uploading} />

      {entries.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="merge-files">
            {(provided) => (
              <ul {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {entries.map((entry, i) => (
                  <Draggable key={entry.uploadResult.file_id} draggableId={entry.uploadResult.file_id} index={i}>
                    {(provided, snapshot) => (
                      <li
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex items-center gap-3 p-3 rounded-lg border bg-white
                          ${snapshot.isDragging ? "shadow-lg border-blue-300" : "border-gray-200"}`}
                      >
                        <span {...provided.dragHandleProps} className="text-gray-400 cursor-grab">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                          </svg>
                        </span>
                        <span className="flex-1 text-sm font-medium truncate">{entry.file.name}</span>
                        <span className="text-xs text-gray-400">{entry.uploadResult.page_count} pages</span>
                        <span className="text-xs text-gray-400">
                          {(entry.file.size / 1024).toFixed(0)} KB
                        </span>
                        <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 ml-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </li>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={skipBlank} onChange={(e) => setSkipBlank(e.target.checked)}
          className="rounded border-gray-300" />
        Skip blank pages
      </label>

      <button
        onClick={handleMerge}
        disabled={loading || entries.length < 1}
        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {loading ? "Merging..." : `Merge ${entries.length} PDF${entries.length !== 1 ? "s" : ""}`}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && (
        <a href={downloadUrl(result.download_url)} download
          className="inline-flex items-center gap-2 text-green-700 font-medium underline">
          Download Merged PDF
        </a>
      )}
    </div>
  );
}
