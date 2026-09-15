"use client";

import { useEffect, useState } from "react";
import { getUsers, createUser, deleteUser } from "@/lib/api";
import type { AuthUser } from "@/lib/api";

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function UserManager({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const [users, setUsers] = useState<(AuthUser & { created_at?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getUsers();
    if (res.success && res.data) setUsers(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!email.trim() || !name.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createUser({ email: email.trim(), name: name.trim(), password, role });
    setSaving(false);
    if (!res.success) { setError(res.error ?? "Failed to create user"); return; }
    setEmail(""); setName(""); setPassword(""); setRole("member"); setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this user? They'll be signed out immediately.")) return;
    const res = await deleteUser(id);
    if (res.success) setUsers((prev) => prev.filter((u) => u.id !== id));
    else alert(res.error ?? "Failed to remove user");
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-800">Manage Users</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="border rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {u.name} {u.id === currentUserId && <span className="text-xs text-gray-400">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{u.email} · added {formatDate(u.created_at)}</p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${u.role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.role}
                  </span>
                  <button onClick={() => handleDelete(u.id)} disabled={u.id === currentUserId} title={u.id === currentUserId ? "Can't remove your own account" : "Remove user"}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <div className="border rounded-xl p-4 bg-blue-50/40 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Temporary password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 ring-blue-400 bg-white" />
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button onClick={handleCreate} disabled={saving}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Adding…" : "Add User"}
                </button>
                <button onClick={() => { setShowForm(false); setError(null); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)}
              className="w-full text-xs text-blue-600 border border-dashed border-blue-300 py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
              + Add User
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
