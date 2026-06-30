"use client";

import { useEffect, useState } from "react";
import { getAuditLogs, getAuditSummary } from "@/lib/api";
import type { AuditEvent } from "@/lib/api";

const ACTION_COLOR: Record<string, string> = {
  extracted:      "bg-blue-100 text-blue-700",
  status_changed: "bg-purple-100 text-purple-700",
  field_updated:  "bg-yellow-100 text-yellow-700",
  field_added:    "bg-green-100 text-green-700",
  field_deleted:  "bg-red-100 text-red-700",
  deleted:        "bg-red-100 text-red-700",
  assigned:       "bg-indigo-100 text-indigo-700",
  rule_triggered: "bg-orange-100 text-orange-700",
  refined:        "bg-teal-100 text-teal-700",
};

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLOR[action] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="text-[10px] text-gray-500">
      <span className="text-gray-400">{label}:</span> {String(value)}
    </span>
  );
}

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<{ total: number; actions: Record<string, number>; entity_types: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { load(); }, [filterAction, filterEntity]);

  const load = async () => {
    setLoading(true);
    const [logRes, sumRes] = await Promise.all([
      getAuditLogs({ action: filterAction || undefined, entity_type: filterEntity || undefined, limit: 500 }),
      getAuditSummary(),
    ]);
    if (logRes.success && logRes.data) setEvents(logRes.data);
    if (sumRes.success && sumRes.data) setSummary(sumRes.data);
    setLoading(false);
  };

  const filtered = events.filter((e) =>
    !search ||
    e.entity_name.toLowerCase().includes(search.toLowerCase()) ||
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    e.user.toLowerCase().includes(search.toLowerCase())
  );

  const allActions = Array.from(new Set(events.map((e) => e.action))).sort();
  const allEntityTypes = Array.from(new Set(events.map((e) => e.entity_type))).sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-gray-800">Audit Log</h3>
        <p className="text-xs text-gray-400 mt-0.5">Full history of every action taken on every document and resource.</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-xl p-4 bg-white">
            <p className="text-2xl font-bold text-gray-800">{summary.total.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Total events</p>
          </div>
          {Object.entries(summary.actions).slice(0, 3).map(([action, count]) => (
            <div key={action} className="border rounded-xl p-4 bg-white">
              <p className="text-2xl font-bold text-gray-800">{count}</p>
              <p className="text-xs text-gray-500 mt-1 capitalize">{action.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, action, or user…"
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
          <option value="">All actions</option>
          {allActions.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </select>
        <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
          <option value="">All types</option>
          {allEntityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={load} className="text-xs text-blue-600 border rounded-lg px-3 py-2 hover:bg-blue-50 font-medium">
          Refresh
        </button>
      </div>

      {/* Log table */}
      <div className="border rounded-xl overflow-hidden bg-white">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <p className="text-sm">No events recorded yet.</p>
            <p className="text-xs mt-1">Actions like extraction, status changes, and field edits appear here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium">Time</th>
                <th className="text-left px-3 py-3 font-medium">Action</th>
                <th className="text-left px-3 py-3 font-medium">Resource</th>
                <th className="text-left px-3 py-3 font-medium">User</th>
                <th className="text-left px-3 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <>
                  <tr key={e.id}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="border-b last:border-0 hover:bg-gray-50/60 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap" title={e.timestamp}>
                      {timeAgo(e.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <ActionBadge action={e.action} />
                    </td>
                    <td className="px-3 py-3 max-w-[180px]">
                      <p className="text-xs font-medium text-gray-800 truncate">{e.entity_name || e.entity_id}</p>
                      <p className="text-[10px] text-gray-400">{e.entity_type}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{e.user}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(e.details).slice(0, 2).map(([k, v]) => (
                          <DetailRow key={k} label={k} value={v} />
                        ))}
                        {Object.keys(e.details).length > 2 && (
                          <span className="text-[10px] text-gray-400">+{Object.keys(e.details).length - 2} more</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={`${e.id}-exp`} className="bg-blue-50/40 border-b">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex gap-4 flex-wrap text-xs">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">TIMESTAMP</p>
                            <p className="font-mono text-gray-700">{new Date(e.timestamp).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">ENTITY ID</p>
                            <p className="font-mono text-gray-700 text-[10px]">{e.entity_id}</p>
                          </div>
                          {Object.entries(e.details).map(([k, v]) => (
                            <div key={k}>
                              <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase">{k.replace(/_/g, " ")}</p>
                              <p className="font-mono text-gray-700">{JSON.stringify(v)}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">Showing {filtered.length} of {events.length} events</p>
    </div>
  );
}
