"use client";

import { useEffect, useState } from "react";
import {
  getFileRecords, getReconciliationFields, runReconciliation,
} from "@/lib/api";
import type { FileRecord, ReconciliationGroup } from "@/lib/api";

export default function ReconciliationPanel() {
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [matchField, setMatchField] = useState("");
  const [compareFields, setCompareFields] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ReconciliationGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFileRecords().then((res) => {
      if (res.success && res.data) setRecords(res.data);
    });
  }, []);

  const toggleFile = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setAvailableFields([]);
    setMatchField("");
    setCompareFields(new Set());
    setResult(null);
  };

  const loadFields = async () => {
    if (selectedIds.size < 2) return;
    const res = await getReconciliationFields(Array.from(selectedIds));
    if (res.success && res.data) {
      setAvailableFields(res.data);
      if (!matchField && res.data[0]) setMatchField(res.data[0]);
    }
  };

  const toggleCompareField = (f: string) => {
    setCompareFields((prev) => {
      const n = new Set(prev);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });
  };

  const handleRun = async () => {
    if (selectedIds.size < 2 || !matchField || compareFields.size === 0) return;
    setLoading(true);
    setError(null);
    const res = await runReconciliation(
      Array.from(selectedIds),
      matchField,
      Array.from(compareFields),
    );
    setLoading(false);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error ?? "Reconciliation failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800">Document Reconciliation</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Select two or more files, choose a key field to match on, then compare specific fields across them.
        </p>
      </div>

      {/* File selection */}
      <div className="border rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">1. Select Files</h4>
          {selectedIds.size >= 2 && (
            <button onClick={loadFields} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              Load Fields →
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto">
          {records.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No files available.</p>
          ) : (
            records.map((r) => (
              <label key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-0">
                <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleFile(r.id)}
                  className="rounded border-gray-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.filename}</p>
                  {r.template_name && <p className="text-xs text-indigo-600">{r.template_name}</p>}
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Field configuration */}
      {availableFields.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-xl bg-white p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">2. Match Key Field</h4>
            <p className="text-xs text-gray-400">Files with the same value for this field will be grouped together.</p>
            <select value={matchField} onChange={(e) => setMatchField(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              {availableFields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="border rounded-xl bg-white p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">3. Compare Fields</h4>
            <p className="text-xs text-gray-400">Fields to compare across matched files. Mismatches will be highlighted.</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {availableFields.filter((f) => f !== matchField).map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={compareFields.has(f)} onChange={() => toggleCompareField(f)}
                    className="rounded border-gray-300" />
                  {f}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {availableFields.length > 0 && (
        <button onClick={handleRun} disabled={loading || !matchField || compareFields.size === 0}
          className="flex items-center gap-2 text-sm bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>}
          {loading ? "Running…" : "Run Reconciliation"}
        </button>
      )}

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold text-gray-700">Results</h4>
            <span className="text-xs bg-green-50 text-green-700 rounded-full px-2 py-0.5 font-medium">
              {result.filter((g) => g.all_match).length} matched
            </span>
            <span className="text-xs bg-red-50 text-red-700 rounded-full px-2 py-0.5 font-medium">
              {result.filter((g) => !g.all_match).length} mismatched
            </span>
          </div>

          {result.map((group, gi) => (
            <div key={gi} className="border rounded-xl bg-white overflow-hidden">
              <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${group.all_match ? "bg-green-50" : "bg-red-50"}`}>
                <span className={`text-xs font-bold ${group.all_match ? "text-green-700" : "text-red-700"}`}>
                  {group.all_match ? "✓ All fields match" : "⚠ Mismatches detected"}
                </span>
                <span className="text-xs text-gray-500">
                  Key: <span className="font-medium text-gray-700">{matchField}</span> = &quot;{group.key_value}&quot;
                </span>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {group.files.map((f) => (
                    <span key={f.id} className="text-[10px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">
                      {f.filename}
                    </span>
                  ))}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium">Field</th>
                    {group.files.map((f) => (
                      <th key={f.id} className="text-left px-3 py-2 font-medium truncate max-w-[140px]">{f.filename}</th>
                    ))}
                    <th className="px-3 py-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.comparisons.map((cmp) => (
                    <tr key={cmp.field} className={`border-b last:border-0 ${!cmp.matches ? "bg-amber-50/60" : ""}`}>
                      <td className="px-4 py-2 text-xs font-medium text-gray-700">{cmp.field}</td>
                      {group.files.map((f) => (
                        <td key={f.id} className="px-3 py-2 text-xs text-gray-800">
                          {cmp.values[f.id] ?? <span className="text-gray-300 italic">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        {cmp.matches
                          ? <span className="text-xs text-green-600 font-medium">Match</span>
                          : <span className="text-xs text-amber-600 font-medium">Mismatch</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
