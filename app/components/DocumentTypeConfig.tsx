"use client";

import { useEffect, useState } from "react";
import {
  getDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType,
} from "@/lib/api";
import type { DocumentType } from "@/lib/api";

function KeywordChips({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (v && !keywords.includes(v)) onChange([...keywords, v]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
      {keywords.map((k) => (
        <span key={k} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
          {k}
          <button onClick={() => onChange(keywords.filter((x) => x !== k))} className="text-gray-400 hover:text-red-500">×</button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        onBlur={add}
        placeholder="+ keyword"
        className="text-xs border-b outline-none focus:border-blue-400 w-16 bg-transparent" />
    </div>
  );
}

function CreateDialog({
  baseTypes,
  onClose,
  onCreated,
}: {
  baseTypes: DocumentType[];
  onClose: () => void;
  onCreated: (dt: DocumentType) => void;
}) {
  const [baseTypeId, setBaseTypeId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [clientDocumentType, setClientDocumentType] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBaseType = (id: string) => {
    setBaseTypeId(id);
    const base = baseTypes.find((b) => b.id === id);
    if (base) setAbbreviation(base.abbreviation);
  };

  const handleCreate = async () => {
    if (!documentType.trim() || !abbreviation.trim()) {
      setError("Document Type and Abbreviation are required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createDocumentType({
      document_type: documentType.trim(),
      abbreviation: abbreviation.trim(),
      client_document_type: clientDocumentType.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (!res.success || !res.data) { setError(res.error ?? "Create failed"); return; }
    onCreated(res.data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Create New Document Type</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Base Type</label>
          <select value={baseTypeId} onChange={(e) => handleBaseType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
            <option value="">— none —</option>
            {baseTypes.map((b) => <option key={b.id} value={b.id}>{b.document_type}</option>)}
          </select>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Document Type</label>
            <span className="text-[10px] text-gray-400">{documentType.length} / 50</span>
          </div>
          <input value={documentType} onChange={(e) => setDocumentType(e.target.value.slice(0, 50))}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Client Document Type</label>
          <input value={clientDocumentType} onChange={(e) => setClientDocumentType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Abbreviation</label>
            <span className="text-[10px] text-gray-400">{abbreviation.length} / 3</span>
          </div>
          <input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value.slice(0, 3).toUpperCase())}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Description</label>
            <span className="text-[10px] text-gray-400">{description.length} / 2000</span>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 resize-none" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentTypeConfig() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getDocumentTypes();
    if (res.success && res.data) setTypes(res.data);
    setLoading(false);
  };

  const patch = async (id: string, updates: Partial<DocumentType>) => {
    setBusyId(id);
    const res = await updateDocumentType(id, updates);
    if (res.success && res.data) setTypes((prev) => prev.map((t) => t.id === id ? res.data! : t));
    setBusyId(null);
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    const res = await deleteDocumentType(id);
    if (res.success) setTypes((prev) => prev.filter((t) => t.id !== id));
    setBusyId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Document Type Configuration</h3>
          <p className="text-xs text-gray-400 mt-0.5">The document taxonomy the classifier uses.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
          Add New DocType
        </button>
      </div>

      <div className="border rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium">Document Type</th>
              <th className="text-left px-3 py-3 font-medium">Client Document Type</th>
              <th className="text-left px-3 py-3 font-medium w-20">Abbrev.</th>
              <th className="text-left px-3 py-3 font-medium">Keywords</th>
              <th className="text-left px-3 py-3 font-medium">Allow Processing</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Loading…</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">No document types configured.</td></tr>
            ) : (
              types.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3 font-medium text-gray-800">{t.document_type}</td>
                  <td className="px-3 py-3">
                    <input defaultValue={t.client_document_type}
                      onBlur={(e) => e.target.value !== t.client_document_type && patch(t.id, { client_document_type: e.target.value })}
                      className="text-xs border-b outline-none focus:border-blue-400 bg-transparent w-32" />
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 tabular-nums">{t.abbreviation}</td>
                  <td className="px-3 py-3">
                    <KeywordChips keywords={t.keywords} onChange={(next) => patch(t.id, { keywords: next })} />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      disabled={busyId === t.id}
                      onClick={() => patch(t.id, { allow_processing: !t.allow_processing })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50
                        ${t.allow_processing ? "bg-green-600" : "bg-gray-300"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                        ${t.allow_processing ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => handleDelete(t.id)} disabled={busyId === t.id}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateDialog
          baseTypes={types}
          onClose={() => setShowCreate(false)}
          onCreated={(dt) => setTypes((prev) => [...prev, dt])}
        />
      )}
    </div>
  );
}
