"use client";

import { useState } from "react";
import { aiPlan, downloadUrl } from "@/lib/api";
import type { UploadResult, AIPlan } from "@/lib/api";

const SUGGESTIONS = [
  "Extract only pages that contain a signature",
  "Remove all blank pages",
  "Keep only the first and last pages",
  "Extract pages with invoice or payment information",
];

interface Props {
  uploadResult: UploadResult;
}

export default function AICommandBar({ uploadResult }: Props) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (cmd?: string) => {
    const text = cmd || instruction;
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    const res = await aiPlan(uploadResult.file_id, text);
    setLoading(false);
    if (res.success && res.data) {
      setPlan(res.data);
    } else {
      setError(res.error || "AI command failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder='e.g. "Extract pages with a signature"'
          className="flex-1 border rounded-lg px-4 py-2.5 text-sm focus:ring-2 ring-blue-300 outline-none"
        />
        <button
          onClick={() => run()}
          disabled={loading || !instruction.trim()}
          className="bg-purple-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors text-sm"
        >
          {loading ? "Thinking..." : "Run"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setInstruction(s); run(s); }}
            disabled={loading}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {plan && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-purple-800">
            Pages selected: {plan.pages_to_keep.length > 0 ? plan.pages_to_keep.join(", ") : "none"}
          </p>
          <p className="text-sm text-purple-700">{plan.reason}</p>
          {plan.download_url && (
            <a href={downloadUrl(plan.download_url)} download
              className="inline-flex items-center gap-1 text-sm font-medium text-purple-700 underline">
              Download Result PDF
            </a>
          )}
        </div>
      )}
    </div>
  );
}
