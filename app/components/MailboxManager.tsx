"use client";

import { useEffect, useState } from "react";
import {
  getMailboxes, createMailbox, updateMailbox, deleteMailbox, getTemplates,
} from "@/lib/api";
import type { Mailbox, Template } from "@/lib/api";

function MailboxForm({
  templates,
  onCreated,
  onCancel,
}: {
  templates: Template[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("imap.gmail.com");
  const [port, setPort] = useState(993);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!label.trim() || !user.trim() || !password.trim()) {
      setError("Label, email and password are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const tmpl = templates.find((t) => t.id === templateId);
    const res = await createMailbox({
      label: label.trim(), host, port, user: user.trim(), password,
      template_id: templateId || null,
      template_name: tmpl?.name ?? null,
    });
    setSaving(false);
    if (!res.success) { setError(res.error ?? "Failed to add mailbox"); return; }
    onCreated();
  };

  return (
    <div className="border rounded-xl p-4 bg-blue-50/40 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Invoices Inbox"
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Tied to template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white">
            <option value="">No template (just ingest)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Email address</label>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="invoices@yourcompany.com"
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Password / app password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">IMAP host</label>
          <input value={host} onChange={(e) => setHost(e.target.value)}
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Port</label>
          <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))}
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={handleSave} disabled={saving}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Adding…" : "Add Mailbox"}
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  );
}

export default function MailboxManager({ onClose }: { onClose: () => void }) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [mRes, tRes] = await Promise.all([getMailboxes(), getTemplates()]);
    if (mRes.success && mRes.data) setMailboxes(mRes.data);
    if (tRes.success && tRes.data) setTemplates(tRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (m: Mailbox) => {
    const res = await updateMailbox(m.id, { enabled: !m.enabled });
    if (res.success && res.data) setMailboxes((prev) => prev.map((x) => x.id === m.id ? res.data! : x));
  };

  const handleTemplateChange = async (m: Mailbox, templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    const res = await updateMailbox(m.id, { template_id: templateId || null, template_name: tmpl?.name ?? null });
    if (res.success && res.data) setMailboxes((prev) => prev.map((x) => x.id === m.id ? res.data! : x));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this mailbox? It will stop being checked for new mail.")) return;
    const res = await deleteMailbox(id);
    if (res.success) setMailboxes((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-800">Manage Mailboxes</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-gray-400">
            Each mailbox is polled independently. Tie one to a template so documents it receives are automatically tagged — e.g. everything sent to invoices@yourcompany.com gets marked as a Transport Invoice on arrival.
          </p>

          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          ) : mailboxes.length === 0 && !showForm ? (
            <p className="text-xs text-gray-400 text-center py-8">No mailboxes configured yet.</p>
          ) : (
            <div className="space-y-2">
              {mailboxes.map((m) => (
                <div key={m.id} className="border rounded-xl p-3 flex items-center gap-3">
                  <label className="flex items-center cursor-pointer">
                    <input type="checkbox" checked={m.enabled} onChange={() => handleToggle(m)} className="rounded" />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.label}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user}</p>
                  </div>
                  <select value={m.template_id ?? ""} onChange={(e) => handleTemplateChange(m, e.target.value)}
                    className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white max-w-[160px]">
                    <option value="">No template</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => handleDelete(m.id)} title="Remove mailbox"
                    className="text-gray-300 hover:text-red-500 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <MailboxForm templates={templates} onCancel={() => setShowForm(false)}
              onCreated={() => { setShowForm(false); load(); }} />
          ) : (
            <button onClick={() => setShowForm(true)}
              className="w-full text-xs text-blue-600 border border-dashed border-blue-300 py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
              + Add Mailbox
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
