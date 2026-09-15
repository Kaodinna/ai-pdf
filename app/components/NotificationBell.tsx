"use client";

import { useEffect, useRef, useState } from "react";
import { getPendingApprovals, getDuplicates, getAuditLogs } from "@/lib/api";

interface NotificationItem {
  id: string;
  severity: "high" | "medium" | "info";
  message: string;
  timestamp: string;
}

const SEEN_KEY = "ai-pdf:notified-ids";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    // Cap stored size so this can't grow forever — keep the most recent 500.
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    // ignore — private browsing / storage disabled shouldn't break notifications
  }
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
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  const seenIds = useRef<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    seenIds.current = loadSeenIds();
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

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
        if (new Date(e.timestamp).getTime() <= dayAgo) continue;

        notifications.push({
          id: `processed-${e.id}`,
          severity: "info",
          message: `"${e.entity_name}" finished processing`,
          timestamp: e.timestamp,
        });

        const rules = (e.details?.rules_triggered as string[]) ?? [];
        if (rules.length > 0) {
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

    // Fire a real OS notification for any "processing complete" item we
    // haven't already notified about — so it reaches the user even if this
    // tab is backgrounded or unfocused, not just the in-app badge. Skipped
    // on the very first load so opening the app doesn't replay history.
    if (hasLoadedOnce.current && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      for (const n of notifications) {
        if (n.severity === "info" && !seenIds.current.has(n.id)) {
          new Notification("Document processing complete", { body: n.message, tag: n.id });
        }
      }
    }
    for (const n of notifications) seenIds.current.add(n.id);
    saveSeenIds(seenIds.current);
    hasLoadedOnce.current = true;

    setItems(notifications);
    setLoading(false);
  };

  const highCount = items.filter((i) => i.severity === "high").length;
  const mediumCount = items.filter((i) => i.severity === "medium").length;
  const badgeColor = highCount > 0 ? "bg-red-500" : mediumCount > 0 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {items.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 text-[10px] font-bold text-white rounded-full w-4 h-4 flex items-center justify-center ${badgeColor}`}>
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
            {permission === "default" && (
              <div className="px-4 py-2.5 border-b bg-blue-50 flex items-center justify-between gap-2">
                <p className="text-xs text-blue-800">Get notified even when this tab isn&apos;t focused.</p>
                <button onClick={requestPermission}
                  className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-blue-700 transition-colors flex-shrink-0">
                  Enable
                </button>
              </div>
            )}
            {permission === "denied" && (
              <p className="px-4 py-2 border-b bg-gray-50 text-[11px] text-gray-500">
                Desktop notifications are blocked — enable them in your browser&apos;s site settings to use this.
              </p>
            )}
            {loading ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">You&apos;re all caught up.</p>
            ) : (
              <div className="divide-y">
                {items.map((item) => (
                  <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.severity === "high" ? "bg-red-500" : item.severity === "medium" ? "bg-amber-400" : "bg-blue-400"}`} />
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
