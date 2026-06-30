"use client";

import { useEffect, useState } from "react";
import {
  getWorkflowStates, createWorkflowState, updateWorkflowState,
  deleteWorkflowState, reorderWorkflowStates,
  getApprovalRoutes, createApprovalRoute, deleteApprovalRoute,
  getPendingApprovals,
} from "@/lib/api";
import type { WorkflowState, ApprovalRoute, PendingApproval } from "@/lib/api";

function ApprovalRouting({ states }: { states: WorkflowState[] }) {
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [stateName, setStateName] = useState("");
  const [approver, setApprover] = useState("");
  const [escalation, setEscalation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [rRes, pRes] = await Promise.all([getApprovalRoutes(), getPendingApprovals()]);
    if (rRes.success && rRes.data) setRoutes(rRes.data);
    if (pRes.success && pRes.data) setPending(pRes.data);
  };

  const handleAdd = async () => {
    if (!stateName.trim() || !approver.trim()) return;
    setSaving(true);
    const hours = escalation.trim() ? Number(escalation) : null;
    const res = await createApprovalRoute(stateName.trim(), approver.trim(), hours);
    setSaving(false);
    if (res.success) {
      setStateName(""); setApprover(""); setEscalation("");
      load();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteApprovalRoute(id);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Approval Routing</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Auto-assign an approver when a file enters a given state, and flag overdue approvals.
        </p>
      </div>

      <div className="border rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b bg-gray-50">
              <th className="text-left px-4 py-2.5 font-medium">State</th>
              <th className="text-left px-3 py-2.5 font-medium">Approver</th>
              <th className="text-left px-3 py-2.5 font-medium">Escalate after</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.state_name}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.approver}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">
                  {r.escalation_hours != null ? `${r.escalation_hours}h` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            <tr className="bg-blue-50/40">
              <td className="px-4 py-2.5">
                <select value={stateName} onChange={(e) => setStateName(e.target.value)}
                  className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white">
                  <option value="">Select state…</option>
                  {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </td>
              <td className="px-3 py-2.5">
                <input type="text" value={approver} onChange={(e) => setApprover(e.target.value)}
                  placeholder="approver email/name"
                  className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400" />
              </td>
              <td className="px-3 py-2.5">
                <input type="number" value={escalation} onChange={(e) => setEscalation(e.target.value)}
                  placeholder="hours"
                  className="w-20 text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 ring-blue-400" />
              </td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={handleAdd} disabled={saving || !stateName.trim() || !approver.trim()}
                  className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 font-medium disabled:opacity-40">
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div className="border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700">Pending Approvals</h4>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {pending.map((p) => (
                <tr key={p.file_id} className={`border-b last:border-0 ${p.overdue ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{p.filename}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs rounded-full px-2.5 py-1 font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{p.approver}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {p.hours_waiting != null ? `${p.hours_waiting}h waiting` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {p.overdue && (
                      <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">Overdue</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WorkflowConfig() {
  const [states, setStates] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadStates(); }, []);

  const loadStates = async () => {
    setLoading(true);
    const res = await getWorkflowStates();
    if (res.success && res.data) setStates(res.data);
    setLoading(false);
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const res = await createWorkflowState(name);
    setSaving(false);
    if (res.success && res.data) {
      setStates((prev) => [...prev, res.data!]);
      setNewName("");
      setAdding(false);
    } else {
      setError(res.error ?? "Failed to add state");
    }
  };

  const handleEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    const res = await updateWorkflowState(id, name);
    setSaving(false);
    if (res.success && res.data) {
      setStates((prev) => prev.map((s) => s.id === id ? res.data! : s));
      setEditingId(null);
    } else {
      setError(res.error ?? "Failed to update state");
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const res = await deleteWorkflowState(id);
    setSaving(false);
    if (res.success) {
      setStates((prev) => prev.filter((s) => s.id !== id));
    } else {
      setError(res.error ?? "Failed to delete state");
    }
  };

  const move = async (id: string, dir: "up" | "down") => {
    const sorted = [...states].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === id);
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === sorted.length - 1) return;

    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];

    const ordered_ids = sorted.map((s) => s.id);
    setStates(sorted.map((s, i) => ({ ...s, order: i })));

    const res = await reorderWorkflowStates(ordered_ids);
    if (res.success && res.data) setStates(res.data);
  };

  const sorted = [...states].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Workflow Configuration</h3>
          <p className="text-xs text-gray-400 mt-0.5">Define the status pipeline files move through.</p>
        </div>
        <button onClick={() => { setAdding(true); setNewName(""); }}
          className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Add State
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="border rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium w-10">#</th>
              <th className="text-left px-3 py-3 font-medium">State</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="py-10 text-center text-gray-400 text-sm">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={3} className="py-10 text-center text-gray-400 text-sm">No states yet.</td></tr>
            ) : (
              sorted.map((state, idx) => (
                <tr key={state.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-3">
                    {editingId === state.id ? (
                      <div className="flex gap-2">
                        <input autoFocus type="text" value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEdit(state.id)}
                          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400" />
                        <button onClick={() => handleEdit(state.id)} disabled={saving}
                          className="text-xs text-white bg-blue-600 rounded px-2 py-1 font-medium disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 border rounded px-2 py-1">Cancel</button>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-800">{state.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => move(state.id, "up")} disabled={idx === 0 || saving}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors" title="Move up">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button onClick={() => move(state.id, "down")} disabled={idx === sorted.length - 1 || saving}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors" title="Move down">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button onClick={() => { setEditingId(state.id); setEditName(state.name); }}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(state.id)} disabled={saving}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50" title="Delete">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}

            {/* Add state inline row */}
            {adding && (
              <tr className="border-t bg-blue-50/40">
                <td className="px-4 py-3 text-xs text-gray-400">{sorted.length + 1}</td>
                <td className="px-3 py-3">
                  <input autoFocus type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="State name…"
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400 bg-white" />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleAdd} disabled={saving || !newName.trim()}
                      className="text-xs text-white bg-blue-600 rounded px-2 py-1 font-medium disabled:opacity-50">Add</button>
                    <button onClick={() => { setAdding(false); setNewName(""); }}
                      className="text-xs text-gray-500 border rounded px-2 py-1 bg-white">Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ApprovalRouting states={sorted} />
    </div>
  );
}
