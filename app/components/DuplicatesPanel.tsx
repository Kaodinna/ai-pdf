"use client";

import { useEffect, useState } from "react";
import { getDuplicates, deleteFileRecord } from "@/lib/api";
import type { DuplicateGroup } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function DuplicatesPanel() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getDuplicates();
    if (res.success && res.data) setGroups(res.data);
    setLoading(false);
  };

  const handleDelete = async (fileId: string) => {
    setDeleting(fileId);
    const res = await deleteFileRecord(fileId);
    if (res.success) {
      setGroups((prev) =>
        prev
          .map((g) => ({ ...g, files: g.files.filter((f) => f.id !== fileId) }))
          .filter((g) => g.files.length > 1)
      );
    }
    setDeleting(null);
  };

  if (loading) return <p className="text-sm text-gray-400 py-10 text-center">Scanning for duplicates…</p>;

  const totalDupeFiles = groups.reduce((sum, g) => sum + g.files.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Duplicate Detection</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Files matched by each template&apos;s unique ID fields. Configure unique ID fields per-template to enable detection.
          </p>
        </div>
        <button onClick={load} className="text-xs text-blue-600 border rounded-lg px-3 py-1.5 hover:bg-blue-50 font-medium">
          Rescan
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-xl bg-white p-5">
          <p className="text-3xl font-bold text-gray-800">{groups.length}</p>
          <p className="text-sm font-medium text-gray-600 mt-1">Duplicate Groups</p>
        </div>
        <div className="border rounded-xl bg-amber-50 p-5">
          <p className="text-3xl font-bold text-gray-800">{totalDupeFiles}</p>
          <p className="text-sm font-medium text-gray-600 mt-1">Files Involved</p>
        </div>
        <div className="border rounded-xl bg-white p-5">
          <p className="text-3xl font-bold text-gray-800">
            {new Set(groups.map((g) => g.template_id)).size}
          </p>
          <p className="text-sm font-medium text-gray-600 mt-1">Templates Affected</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="border rounded-xl bg-white p-10 text-center text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm">No duplicates found.</p>
          <p className="text-xs mt-1">
            Make sure your templates have <span className="font-medium">unique ID fields</span> configured so matches can be detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <div key={gi} className="border rounded-xl bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-medium">
                    {g.files.length} matches
                  </span>
                  <span className="text-xs bg-indigo-50 text-indigo-700 rounded px-2 py-0.5">{g.template_name}</span>
                  <span className="text-xs text-gray-500">
                    matched on{" "}
                    {Object.entries(g.match_values).map(([k, v], i) => (
                      <span key={k}>
                        {i > 0 && ", "}
                        <span className="font-medium text-gray-700">{k}</span>=&quot;{v}&quot;
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {g.files.map((f) => (
                    <tr key={f.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{f.filename}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs rounded-full px-2.5 py-1 font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {f.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{formatDate(f.uploaded_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => handleDelete(f.id)} disabled={deleting === f.id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
                          {deleting === f.id ? "Deleting…" : "Delete"}
                        </button>
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
