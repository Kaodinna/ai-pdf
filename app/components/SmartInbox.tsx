"use client";

import { useEffect, useState } from "react";
import {
  getInbox, getInboxConfig, pollInbox, setInboxStatus, assignInboxRecord,
} from "@/lib/api";
import type { InboxRecord, InboxCounts } from "@/lib/api";
import MailboxManager from "@/components/MailboxManager";

const STATUSES = ["To Review", "Processing", "Archived", "No Attachment"];

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-gray-800">{value}</span>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SmartInbox({
  onOpenFiles,
  initialSearch,
}: {
  onOpenFiles: (fileIds: string[]) => void;
  initialSearch?: string;
}) {
  const [records, setRecords] = useState<InboxRecord[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ processing: 0, to_review: 0, archived: 0, pages_to_process: 0 });
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mailboxCount, setMailboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [pollMessage, setPollMessage] = useState<string | null>(null);
  const [pollErrors, setPollErrors] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [showMailboxManager, setShowMailboxManager] = useState(false);

  useEffect(() => { if (initialSearch) setSearch(initialSearch); }, [initialSearch]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [cfgRes, inboxRes] = await Promise.all([getInboxConfig(), getInbox()]);
    if (cfgRes.success && cfgRes.data) { setConfigured(cfgRes.data.configured); setMailboxCount(cfgRes.data.mailbox_count); }
    if (inboxRes.success && inboxRes.data) { setRecords(inboxRes.data.records); setCounts(inboxRes.data.counts); }
    setLoading(false);
  };

  const handleCheckMail = async () => {
    setPolling(true);
    setPollMessage(null);
    setPollErrors([]);
    const res = await pollInbox();
    setPolling(false);
    if (!res.success || !res.data) {
      setPollMessage(res.error ?? "Check failed");
      return;
    }
    // Per-mailbox failures (bad credentials, connection issues, etc.) come
    // back as a warning list inside an otherwise-"successful" response —
    // show them, don't let a 0-ingested count read as "no new mail" and
    // hide a mailbox that's actually broken.
    setPollErrors(res.data.errors);
    if (res.data.first_run) {
      setPollMessage("Connected — starting from today's mail onward.");
    } else if (res.data.ingested > 0) {
      setPollMessage(`${res.data.ingested} new email(s), ${res.data.new_files} file(s) added.`);
    } else if (res.data.errors.length === 0) {
      setPollMessage("No new mail.");
    }
    load();
  };

  const handleStatusChange = async (id: string, status: string) => {
    const res = await setInboxStatus(id, status);
    if (res.success && res.data) load();
  };

  const handleAssign = async (id: string, assignedTo: string) => {
    const res = await assignInboxRecord(id, assignedTo || null);
    if (res.success && res.data) {
      setRecords((prev) => prev.map((r) => r.id === id ? res.data! : r));
    }
  };

  const filtered = records.filter((r) => {
    if (!showArchived && r.status === "Archived") return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.from.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q);
  });

  if (configured === false) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Smart Inbox isn't connected yet</h3>
        <p className="text-xs text-gray-400 mb-4">
          Add a mailbox to start receiving documents automatically — tie it to a template so mail sent to that address gets pre-sorted on arrival.
        </p>
        <button onClick={() => setShowMailboxManager(true)}
          className="text-xs bg-blue-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors">
          + Add Mailbox
        </button>
        {showMailboxManager && (
          <MailboxManager onClose={() => { setShowMailboxManager(false); load(); }} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showMailboxManager && (
        <MailboxManager onClose={() => { setShowMailboxManager(false); load(); }} />
      )}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Processing" value={counts.processing} />
        <StatCard label="To Review" value={counts.to_review} />
        <StatCard label="Archived" value={counts.archived} />
        <StatCard label="Page(s) to be processed" value={counts.pages_to_process} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="pl-9 pr-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-1 ring-blue-400 w-56" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            Show Archived
          </label>
        </div>
        <div className="flex items-center gap-2">
          {pollMessage && <span className="text-xs text-gray-500">{pollMessage}</span>}
          <button onClick={() => setShowMailboxManager(true)}
            className="text-xs text-gray-500 border px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            {mailboxCount} mailbox{mailboxCount === 1 ? "" : "es"} · Manage
          </button>
          <button onClick={handleCheckMail} disabled={polling}
            className="flex items-center gap-1.5 text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {polling && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>}
            {polling ? "Checking…" : "Check Mail Now"}
          </button>
        </div>
      </div>

      {pollErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-700 mb-1">
            {pollErrors.length === 1 ? "A mailbox failed to check:" : `${pollErrors.length} mailboxes failed to check:`}
          </p>
          <ul className="space-y-0.5">
            {pollErrors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 break-words">{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium">From / Subject</th>
              <th className="text-left px-3 py-3 font-medium">Email Received</th>
              <th className="text-left px-3 py-3 font-medium">Attachments</th>
              <th className="text-left px-3 py-3 font-medium">Status</th>
              <th className="text-left px-3 py-3 font-medium">Assignee</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-16 text-center text-gray-400 text-sm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-gray-400">
                  <p className="text-sm">No documents yet.</p>
                  <p className="text-xs mt-1">Documents arrive here automatically from the connected mailbox, checked every minute.</p>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[280px]">{r.subject}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[280px]">{r.from}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(r.received_at)}</td>
                  <td className="px-3 py-3">
                    {r.attachment_count > 0 ? (
                      <button onClick={() => onOpenFiles(r.file_ids)} className="text-xs text-blue-600 hover:underline">
                        {r.attachment_count} file{r.attachment_count === 1 ? "" : "s"} · {r.page_count}p
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 italic">none</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                      className="text-xs rounded-full px-2.5 py-1 font-medium bg-blue-50 text-blue-700 border border-blue-200 outline-none">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input defaultValue={r.assigned_to ?? ""} placeholder="Unassigned"
                      onBlur={(e) => e.target.value !== (r.assigned_to ?? "") && handleAssign(r.id, e.target.value)}
                      className="text-xs border-b outline-none focus:border-blue-400 bg-transparent w-28" />
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-gray-300">
                    {r.body_preview && <span title={r.body_preview}>ⓘ</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
