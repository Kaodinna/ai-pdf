"use client";

import { useEffect, useState } from "react";
import {
  getRules, getRuleMeta, createRule, updateRule, toggleRule, deleteRule,
  generateRule, testRule, getFileRecords,
} from "@/lib/api";
import type { Rule, RuleCondition, RuleAction, GeneratedRule, FileRecord } from "@/lib/api";

const TRIGGER_LABELS: Record<string, string> = {
  on_extraction:       "ON EXTRACTION",
  on_file_creation:    "ON FILE CREATION",
  on_file_upload:      "ON FILE UPLOAD",
  on_export:           "ON EXPORT",
  on_email_queue_send: "ON EMAIL QUEUE SEND",
  on_email_reply:      "ON EMAIL REPLY",
};

const OPERATORS = [
  "equals", "not_equals", "contains", "not_contains",
  "is_null", "is_not_null", "starts_with", "ends_with",
];

function formatConditions(rule: Rule) {
  if (!rule.conditions.length) return "—";
  return rule.conditions
    .map((c) => {
      if (c.operator === "is_null" || c.operator === "is_not_null")
        return `${c.field} ${c.operator.replace("_", " ")}`;
      return `${c.field} ${c.operator.replace("_", " ")} "${c.value}"`;
    })
    .join(` ${rule.logic_operator} `);
}

// ─── Condition editor row ──────────────────────────────────────────────────

function ConditionRow({
  cond, onChange, onRemove,
}: {
  cond: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const noValue = cond.operator === "is_null" || cond.operator === "is_not_null";
  return (
    <div className="flex gap-2 items-center">
      <input value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value })}
        placeholder="Field name" className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
      <select value={cond.operator} onChange={(e) => onChange({ ...cond, operator: e.target.value })}
        className="text-xs border rounded px-1.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white">
        {OPERATORS.map((op) => <option key={op} value={op}>{op.replace("_", " ")}</option>)}
      </select>
      {!noValue && (
        <input value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })}
          placeholder="Value" className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
      )}
      <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Action editor row ─────────────────────────────────────────────────────

function ActionRow({
  action, onChange, onRemove,
}: {
  action: RuleAction;
  onChange: (a: RuleAction) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <select value={action.type} onChange={(e) => onChange({ ...action, type: e.target.value as RuleAction["type"] })}
        className="text-xs border rounded px-1.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white w-28">
        <option value="set_status">set status</option>
        <option value="set_field">set field</option>
      </select>
      {action.type === "set_field" && (
        <input value={action.field ?? ""} onChange={(e) => onChange({ ...action, field: e.target.value })}
          placeholder="Field name" className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
      )}
      <input value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
        placeholder={action.type === "set_status" ? "Status name (e.g. Approved)" : "New value"}
        className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
      <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Rule wizard ──────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5;

function RuleWizard({
  triggerType: initialTrigger,
  fileRecords,
  onSaved,
  onClose,
}: {
  triggerType: string;
  fileRecords: FileRecord[];
  onSaved: (r: Rule) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [triggerType, setTriggerType] = useState(initialTrigger);
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [logicOp, setLogicOp] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<RuleCondition[]>([{ field: "", operator: "equals", value: "" }]);
  const [actions, setActions] = useState<RuleAction[]>([{ type: "set_status", value: "" }]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { triggered: boolean; condition_results: Array<{ condition: RuleCondition; passed: boolean; field_value: string | null }>; actions_that_would_run: RuleAction[] }>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedFile = fileRecords.find((f) => f.id === selectedFileId);
  const sampleData: Record<string, string | null> = {};
  if (selectedFile) {
    for (const page of selectedFile.pages) {
      for (const [k, v] of Object.entries(page.fields)) {
        if (sampleData[k] === undefined) sampleData[k] = v;
      }
    }
  }

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    const res = await generateRule({ description, trigger_type: triggerType, file_id: selectedFileId || undefined });
    setGenerating(false);
    if (res.success && res.data) {
      const g: GeneratedRule = res.data;
      setName(g.name);
      setDesc(g.description);
      setLogicOp(g.logic_operator);
      setConditions(g.conditions.length ? g.conditions : [{ field: "", operator: "equals", value: "" }]);
      setActions(g.actions.length ? g.actions : [{ type: "set_status", value: "" }]);
      setStep(4);
    } else {
      setError(res.error ?? "Generation failed");
    }
  };

  const handleTest = async () => {
    if (!selectedFileId) { setError("Select a file first (Step 2)"); return; }
    setTesting(true);
    setTestResult(null);
    const res = await testRule({ conditions, logic_operator: logicOp, actions, file_id: selectedFileId });
    setTesting(false);
    if (res.success && res.data) setTestResult(res.data);
    else setError(res.error ?? "Test failed");
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Rule name is required"); return; }
    setSaving(true);
    const res = await createRule({ name, trigger_type: triggerType, logic_operator: logicOp, conditions, actions, description: desc, created_by: "" });
    setSaving(false);
    if (res.success && res.data) onSaved(res.data);
    else setError(res.error ?? "Save failed");
  };

  const stepMeta = [
    { n: 1, label: "Scope", sub: "Where this rule applies" },
    { n: 2, label: "File Preview", sub: "Select a file to preview and build your rule" },
    { n: 3, label: "Describe Rule", sub: "Describe your rule in Plain English" },
    { n: 4, label: "Conditions (IF)", sub: "Define the triggers for this rule" },
    { n: 5, label: "Actions (THEN)", sub: "What should happen when conditions are met" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[700px] bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Create Automated Rule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Step list */}
          <div className="w-56 border-r bg-gray-50 p-4 flex-shrink-0 overflow-y-auto">
            {stepMeta.map(({ n, label, sub }) => {
              const done = step > n;
              const active = step === n;
              return (
                <div key={n} className={`flex gap-3 mb-5 ${active ? "" : "opacity-50"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5
                    ${done ? "bg-blue-600 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                    {done ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : n}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${active ? "text-blue-700" : "text-gray-600"}`}>{label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{sub}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Step 1: Scope */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Type</label>
                  <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setStep(2)}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  Continue
                </button>
              </div>
            )}

            {/* Step 2: File Preview */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Select a file to use as context (optional)</label>
                  <select value={selectedFileId} onChange={(e) => setSelectedFileId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                    <option value="">— Skip —</option>
                    {fileRecords.filter((f) => f.pages.length > 0).map((f) => (
                      <option key={f.id} value={f.id}>{f.filename} ({f.template_name ?? "no template"})</option>
                    ))}
                  </select>
                </div>
                {selectedFileId && Object.keys(sampleData).length > 0 && (
                  <div className="bg-slate-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs font-bold text-slate-300 mb-2">Raw File JSON</p>
                    <pre className="text-[10px] text-green-300 whitespace-pre-wrap break-all">
                      {JSON.stringify(sampleData, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Back</button>
                  <button onClick={() => setStep(3)}
                    className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Describe Rule */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Describe your rule in plain English. AI will generate the conditions and actions.</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder={`e.g., If the sender is 'test@mely.ai' and the document is a Bill of Lading, then set the weight unit of measure to 'LBS'`}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-blue-400 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Back</button>
                  <button onClick={handleGenerate} disabled={generating || !description.trim()}
                    className="flex items-center gap-2 bg-blue-600 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {generating && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                    {generating ? "Generating…" : "Generate Rule"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Conditions */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600">Rule name:</span>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="flex-1 text-sm border rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400" />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600">Logic:</span>
                  <select value={logicOp} onChange={(e) => setLogicOp(e.target.value as "AND" | "OR")}
                    className="text-sm border rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400 bg-white">
                    <option value="AND">ALL conditions must match (AND)</option>
                    <option value="OR">ANY condition must match (OR)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {conditions.map((c, i) => (
                    <ConditionRow key={i} cond={c}
                      onChange={(updated) => setConditions((prev) => prev.map((x, j) => j === i ? updated : x))}
                      onRemove={() => setConditions((prev) => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
                <button onClick={() => setConditions((prev) => [...prev, { field: "", operator: "equals", value: "" }])}
                  className="text-xs text-blue-600 border border-dashed border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors">
                  + Add Condition
                </button>

                {/* Test result */}
                {testResult && (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${testResult.triggered ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <p className={`font-semibold ${testResult.triggered ? "text-green-700" : "text-red-700"}`}>
                      {testResult.triggered ? "✓ Rule would trigger" : "✗ Rule would NOT trigger"}
                    </p>
                    {testResult.condition_results.map((cr, i) => (
                      <p key={i} className={cr.passed ? "text-green-700" : "text-red-600"}>
                        {cr.passed ? "✓" : "✗"} {cr.condition.field} {cr.condition.operator} "{cr.condition.value}"
                        {cr.field_value !== undefined && <span className="text-gray-500"> (got: "{cr.field_value}")</span>}
                      </p>
                    ))}
                  </div>
                )}

                <button onClick={() => setStep(5)}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  Continue to Actions →
                </button>
              </div>
            )}

            {/* Step 5: Actions */}
            {step === 5 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Define what happens when the conditions are met.</p>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <ActionRow key={i} action={a}
                      onChange={(updated) => setActions((prev) => prev.map((x, j) => j === i ? updated : x))}
                      onRemove={() => setActions((prev) => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
                <button onClick={() => setActions((prev) => [...prev, { type: "set_status", value: "" }])}
                  className="text-xs text-blue-600 border border-dashed border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors">
                  + Add Action
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">CANCEL</button>
          <div className="flex gap-2">
            {step >= 4 && (
              <button onClick={handleTest} disabled={testing || !selectedFileId}
                title={!selectedFileId ? "Select a file in Step 2 first" : ""}
                className="text-sm border border-blue-600 text-blue-600 px-4 py-1.5 rounded-lg font-medium hover:bg-blue-50 disabled:opacity-40 transition-colors">
                {testing ? "Testing…" : "TEST RULE"}
              </button>
            )}
            <button onClick={handleSave} disabled={saving || step < 4}
              className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-40 transition-colors">
              {saving ? "Saving…" : "SAVE RULE"}
            </button>
            <button onClick={() => { setStep(1); setDescription(""); setName(""); setConditions([{ field: "", operator: "equals", value: "" }]); setActions([{ type: "set_status", value: "" }]); }}
              className="text-sm border text-gray-500 px-4 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              RESET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────

export default function RuleDashboard() {
  const [triggerTypes, setTriggerTypes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("on_extraction");
  const [rules, setRules] = useState<Rule[]>([]);
  const [fileRecords, setFileRecords] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [metaRes, fileRes] = await Promise.all([getRuleMeta(), getFileRecords()]);
    if (metaRes.success && metaRes.data) {
      setTriggerTypes(metaRes.data.trigger_types);
      setActiveTab(metaRes.data.trigger_types[0] ?? "on_extraction");
    }
    if (fileRes.success && fileRes.data) setFileRecords(fileRes.data);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, [activeTab]);

  const loadRules = async () => {
    const res = await getRules(activeTab);
    if (res.success && res.data) setRules(res.data);
  };

  const handleToggle = async (id: string) => {
    setTogglingId(id);
    const res = await toggleRule(id);
    if (res.success && res.data) {
      setRules((prev) => prev.map((r) => r.id === id ? res.data! : r));
    }
    setTogglingId(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteRule(id);
    if (res.success) setRules((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  };

  const handleSaved = (rule: Rule) => {
    if (rule.trigger_type === activeTab) {
      setRules((prev) => [...prev, rule].sort((a, b) => a.sequence - b.sequence));
    }
    setShowWizard(false);
  };

  const filtered = rules.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Rule Dashboard</h3>
            <p className="text-xs text-gray-400 mt-0.5">Automation rules that run on document events.</p>
          </div>
          <button onClick={() => setShowWizard(true)}
            className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
            ADD RULE
          </button>
        </div>

        {/* Trigger type tabs */}
        <div className="border-b flex gap-0 overflow-x-auto">
          {triggerTypes.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors whitespace-nowrap
                ${activeTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {TRIGGER_LABELS[t] ?? t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…"
            className="w-full border-b pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400 bg-transparent" />
        </div>

        {/* Table */}
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium w-10">Seq</th>
                <th className="text-left px-3 py-3 font-medium">Name</th>
                <th className="text-left px-3 py-3 font-medium">Conditions</th>
                <th className="text-left px-3 py-3 font-medium">Description</th>
                <th className="text-left px-3 py-3 font-medium">Active</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    <p className="text-sm">No rules for this trigger type.</p>
                    <p className="text-xs mt-1">Click ADD RULE to create your first automation rule.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{rule.sequence}</td>
                    <td className="px-3 py-3 font-medium text-gray-800 max-w-[140px]">
                      <p className="truncate">{rule.name}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[200px]">
                      <p className="truncate" title={formatConditions(rule)}>{formatConditions(rule)}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 max-w-[180px]">
                      <p className="truncate">{rule.description || "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        disabled={togglingId === rule.id}
                        onClick={() => handleToggle(rule.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50
                          ${rule.active ? "bg-blue-600" : "bg-gray-300"}`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                          ${rule.active ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => handleDelete(rule.id)} disabled={deletingId === rule.id}
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
      </div>

      {showWizard && (
        <RuleWizard
          triggerType={activeTab}
          fileRecords={fileRecords}
          onSaved={handleSaved}
          onClose={() => setShowWizard(false)}
        />
      )}
    </>
  );
}
