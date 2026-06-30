"use client";

import { useEffect, useState } from "react";
import { getFileRecords, getAuditLogs, getRules } from "@/lib/api";
import type { FileRecord, AuditEvent } from "@/lib/api";

function StatCard({ label, value, sub, color = "bg-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`border rounded-xl p-5 ${color}`}>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniBar({ label, value, max, color = "bg-blue-500" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-gray-600 w-28 truncate flex-shrink-0">{label}</p>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 w-8 text-right tabular-nums">{value}</p>
    </div>
  );
}

function groupByDay(events: AuditEvent[], action?: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (action && e.action !== action) continue;
    const day = e.timestamp.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function SparkBars({ data, days }: { data: Record<string, number>; days: string[] }) {
  const max = Math.max(1, ...days.map((d) => data[d] ?? 0));
  return (
    <div className="flex items-end gap-1 h-10">
      {days.map((day) => {
        const val = data[day] ?? 0;
        const pct = (val / max) * 100;
        return (
          <div key={day} className="flex-1 flex flex-col items-center gap-0.5" title={`${day}: ${val}`}>
            <div className="w-full bg-blue-500 rounded-sm transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [ruleCount, setRuleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [fileRes, auditRes, ruleRes] = await Promise.all([
      getFileRecords(),
      getAuditLogs({ limit: 500 }),
      getRules(),
    ]);
    if (fileRes.success && fileRes.data) setRecords(fileRes.data);
    if (auditRes.success && auditRes.data) setEvents(auditRes.data);
    if (ruleRes.success && ruleRes.data) setRuleCount(ruleRes.data.length);
    setLoading(false);
  };

  if (loading) return <p className="text-sm text-gray-400 py-10 text-center">Loading analytics…</p>;

  const days = last7Days();
  const extractionsByDay = groupByDay(events, "extracted");
  const statusChangesByDay = groupByDay(events, "status_changed");

  // File stats
  const totalFiles = records.length;
  const extractedFiles = records.filter((r) => r.extracted_at).length;
  const statusCounts: Record<string, number> = {};
  for (const r of records) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  const approvedCount = statusCounts["Approved"] ?? 0;
  const rejectedCount = statusCounts["Rejected"] ?? 0;

  // Template distribution
  const templateCounts: Record<string, number> = {};
  for (const r of records) {
    const t = r.template_name ?? "No template";
    templateCounts[t] = (templateCounts[t] ?? 0) + 1;
  }
  const topTemplates = Object.entries(templateCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTemplateCount = Math.max(1, ...topTemplates.map(([, v]) => v));

  // Action breakdown
  const actionCounts: Record<string, number> = {};
  for (const e of events) actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1;
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxActionCount = Math.max(1, ...topActions.map(([, v]) => v));

  // Extraction rate
  const extractionRate = totalFiles === 0 ? 0 : Math.round((extractedFiles / totalFiles) * 100);

  // Avg time to extract (from uploaded_at to extracted_at, in minutes)
  const extractionTimes = records
    .filter((r) => r.extracted_at && r.uploaded_at)
    .map((r) => (new Date(r.extracted_at!).getTime() - new Date(r.uploaded_at).getTime()) / 60000);
  const avgExtractionMin = extractionTimes.length === 0 ? 0 : Math.round(extractionTimes.reduce((a, b) => a + b, 0) / extractionTimes.length);

  const totalEvents = events.length;
  const todayEvents = events.filter((e) => e.timestamp.slice(0, 10) === days[6]).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Analytics</h3>
          <p className="text-xs text-gray-400 mt-0.5">Platform usage, processing volumes, and document outcomes.</p>
        </div>
        <button onClick={load} className="text-xs text-blue-600 border rounded-lg px-3 py-1.5 hover:bg-blue-50 font-medium">
          Refresh
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Files" value={totalFiles} sub={`${extractedFiles} extracted`} />
        <StatCard label="Extraction Rate" value={`${extractionRate}%`} sub="files with extracted data" />
        <StatCard label="Approved" value={approvedCount} sub={`${rejectedCount} rejected`} color="bg-green-50" />
        <StatCard label="Active Rules" value={ruleCount} sub="automation rules" color="bg-blue-50" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Extractions this week */}
        <div className="border rounded-xl bg-white p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-1">Extractions — Last 7 Days</h4>
          <p className="text-xs text-gray-400 mb-3">Daily extraction events</p>
          <SparkBars data={extractionsByDay} days={days} />
          <div className="flex justify-between mt-1">
            {days.map((d) => (
              <p key={d} className="text-[9px] text-gray-300 flex-1 text-center">
                {new Date(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1)}
              </p>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            <span className="font-bold text-gray-800">{days.map((d) => extractionsByDay[d] ?? 0).reduce((a, b) => a + b, 0)}</span> extractions this week
          </p>
        </div>

        {/* Status changes this week */}
        <div className="border rounded-xl bg-white p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-1">Status Changes — Last 7 Days</h4>
          <p className="text-xs text-gray-400 mb-3">Daily workflow transitions</p>
          <SparkBars data={statusChangesByDay} days={days} />
          <div className="flex justify-between mt-1">
            {days.map((d) => (
              <p key={d} className="text-[9px] text-gray-300 flex-1 text-center">
                {new Date(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1)}
              </p>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            <span className="font-bold text-gray-800">{days.map((d) => statusChangesByDay[d] ?? 0).reduce((a, b) => a + b, 0)}</span> transitions this week
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Status breakdown */}
        <div className="border rounded-xl bg-white p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Files by Status</h4>
          <div className="space-y-2">
            {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <MiniBar key={status} label={status} value={count} max={totalFiles} />
            ))}
            {Object.keys(statusCounts).length === 0 && <p className="text-xs text-gray-400">No files yet.</p>}
          </div>
        </div>

        {/* Template distribution */}
        <div className="border rounded-xl bg-white p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Templates</h4>
          <div className="space-y-2">
            {topTemplates.map(([name, count]) => (
              <MiniBar key={name} label={name} value={count} max={maxTemplateCount} color="bg-purple-400" />
            ))}
            {topTemplates.length === 0 && <p className="text-xs text-gray-400">No templates used yet.</p>}
          </div>
        </div>

        {/* Activity breakdown */}
        <div className="border rounded-xl bg-white p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Activity Breakdown</h4>
          <div className="space-y-2">
            {topActions.map(([action, count]) => (
              <MiniBar key={action} label={action.replace(/_/g, " ")} value={count} max={maxActionCount} color="bg-green-400" />
            ))}
            {topActions.length === 0 && <p className="text-xs text-gray-400">No activity yet.</p>}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-xl bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">Avg. time to extract</p>
          <p className="text-2xl font-bold text-gray-800">{avgExtractionMin}<span className="text-sm font-normal text-gray-400 ml-1">min</span></p>
          <p className="text-xs text-gray-400 mt-1">from upload to first extraction</p>
        </div>
        <div className="border rounded-xl bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">Audit events today</p>
          <p className="text-2xl font-bold text-gray-800">{todayEvents}</p>
          <p className="text-xs text-gray-400 mt-1">of {totalEvents.toLocaleString()} total</p>
        </div>
        <div className="border rounded-xl bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">Approval rate</p>
          <p className="text-2xl font-bold text-gray-800">
            {totalFiles === 0 ? "—" : `${Math.round((approvedCount / totalFiles) * 100)}%`}
          </p>
          <p className="text-xs text-gray-400 mt-1">{approvedCount} of {totalFiles} files approved</p>
        </div>
      </div>
    </div>
  );
}
