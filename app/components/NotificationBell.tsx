"use client";

import { useEffect, useState } from "react";
import { getPendingApprovals, getDuplicates, getAuditLogs } from "@/lib/api";

interface NotificationItem {
  id: string;
  severity: "high" | "medium";
  message: string;
  timestamp: string;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoading(true);
    const [approvalsRes, dupesRes, auditRes] = await Promise.all([
      getPendingApprovals(),
      getDuplicates(),
      getAuditLogs({ action: "extracted", limit: 50 }),
    ]);

    const notifications: NotificationItem[] = [];

    if (approvalsRes.success && approvalsRes.data) {
      for (const p of approvalsRes.data) {
        if (p.overdue) {
          notifications.push({
            id: `approval-${p.file_id}`,
            severity: "high",
            message: `"${p.filename}" is overdue for approval (waiting on ${p.approver})`,
            timestamp: p.entered_at ?? new Date().toISOString(),
          });
        }
      }
    }

    if (dupesRes.success && dupesRes.data) {
      for (const g of dupesRes.data) {
        notifications.push({
          id: `dupe-${g.template_id}-${JSON.stringify(g.match_values)}`,
          severity: "medium",
          message: `${g.files.length} duplicate files detected for template "${g.template_name}"`,
          timestamp: g.files[0]?.uploaded_at ?? new Date().toISOString(),
        });
      }
    }

    if (auditRes.success && auditRes.data) {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const e of auditRes.data) {
        const rules = (e.details?.rules_triggered as string[]) ?? [];
        if (rules.length > 0 && new Date(e.timestamp).getTime() > dayAgo) {
          notifications.push({
            id: `rule-${e.id}`,
            severity: "medium",
            message: `Rule${rules.length > 1 ? "s" : ""} "${rules.join(", ")}" triggered on "${e.entity_name}"`,
            timestamp: e.timestamp,
          });
        }
      }
    }

    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setItems(notifications);
    setLoading(false);
  };

  const highCount = items.filter((i) => i.severity === "high").length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {items.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 text-[10px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center ${highCount > 0 ? "bg-red-500" : "bg-amber-500"}`}>
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto bg-white border rounded-xl shadow-lg z-20">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">Notifications</h4>
              <button onClick={load} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Refresh</button>
            </div>
            {loading ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">You&apos;re all caught up.</p>
            ) : (
              <div className="divide-y">
                {items.map((item) => (
                  <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.severity === "high" ? "bg-red-500" : "bg-amber-400"}`} />
                      <div className="flex-1">
                        <p className="text-xs text-gray-700">{item.message}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(item.timestamp)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
