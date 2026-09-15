"use client";

import { useEffect, useState } from "react";
import { proposeTemplate, createTemplate } from "@/lib/api";
import type { Template } from "@/lib/api";

function EditableTagList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
            {item}
            <button type="button" onClick={() => onChange(items.filter((i) => i !== item))}
              className="text-blue-400 hover:text-blue-700 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 ring-blue-400" />
        <button type="button" onClick={add} disabled={!draft.trim()}
          className="bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-200 disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}

export default function ProposeTemplateModal({
  fileId,
  onClose,
  onCreated,
}: {
  fileId: string;
  onClose: () => void;
  onCreated: (template: Template) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [tableFields, setTableFields] = useState<string[]>([]);
  const [uniqueIdField, setUniqueIdField] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const res = await proposeTemplate(fileId);
      setLoading(false);
      if (!res.success || !res.data) {
        setError(res.error ?? "Couldn't read this document to propose a template");
        return;
      }
      setName(res.data.suggested_name);
      setTemplateType(res.data.suggested_type);
      setFields(res.data.direct_link_fields);
      setTableFields(res.data.table_fields);
    })();
  }, [fileId]);

  const handleSave = async () => {
    if (!name.trim() || !templateType.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createTemplate({
      name: name.trim(),
      template_type: templateType.trim(),
      direct_link_fields: fields,
      table_fields: tableFields,
      special_conditions: [],
      unique_id_fields: uniqueIdField ? [uniqueIdField] : [],
    });
    setSaving(false);
    if (!res.success || !res.data) { setError(res.error ?? "Failed to save template"); return; }
    onCreated(res.data);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-800">Create Template From This Document</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-10">Reading the document…</p>
          ) : error ? (
            <p className="text-xs text-red-600 text-center py-10">{error}</p>
          ) : (
            <>
              <p className="text-xs text-gray-400">
                Lifted from this document — review and edit before saving. Nothing is created until you click Save.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Template Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Document Type</label>
                  <input value={templateType} onChange={(e) => setTemplateType(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Fields ({fields.length}) — remove any that don't belong, add ones that are missing
                </label>
                <EditableTagList items={fields} onChange={setFields} placeholder="Add a field name" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Unique ID Field</label>
                <p className="text-xs text-gray-400 mb-1.5">
                  Which field uniquely identifies one document? Used to detect duplicate uploads later.
                </p>
                <select value={uniqueIdField} onChange={(e) => setUniqueIdField(e.target.value)}
                  className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white">
                  <option value="">— None (no duplicate detection) —</option>
                  {fields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Table Columns ({tableFields.length})</label>
                <EditableTagList items={tableFields} onChange={setTableFields} placeholder="Add a column name" />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>

        {!loading && !error && (
          <div className="px-5 py-4 border-t">
            <button onClick={handleSave} disabled={saving || !name.trim() || !templateType.trim()}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
