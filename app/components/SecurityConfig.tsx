"use client";

import { useEffect, useState } from "react";
import {
  getSecurityConfig,
  createSecurityRole, updateSecurityRole, deleteSecurityRole,
  createSecurityUser, updateSecurityUser, deleteSecurityUser,
  createApiKey, revokeApiKey, deleteApiKey,
  updateSecuritySettings,
} from "@/lib/api";
import type { SecurityConfig, SecurityRole, SecurityUser, ApiKey, SecuritySettings } from "@/lib/api";

type SectionTab = "users" | "roles" | "api_keys" | "settings";

// ─── Role modal ────────────────────────────────────────────────────────────

function RoleModal({
  initial,
  allPermissions,
  onSave,
  onClose,
}: {
  initial?: SecurityRole;
  allPermissions: string[];
  onSave: (r: SecurityRole) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(initial?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (perm: string) =>
    setPermissions((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    const res = initial
      ? await updateSecurityRole(initial.id, { name, description, permissions })
      : await createSecurityRole({ name, description, permissions });
    setSaving(false);
    if (res.success && res.data) onSave(res.data);
    else setError(res.error ?? "Save failed");
  };

  const grouped: Record<string, string[]> = {};
  for (const p of allPermissions) {
    const [resource] = p.split(".");
    (grouped[resource] ??= []).push(p);
  }

  const hasWildcard = permissions.includes("*");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-800">{initial ? "Edit Role" : "New Role"}</h2>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Permissions</label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={hasWildcard}
                  onChange={(e) => setPermissions(e.target.checked ? ["*"] : [])}
                  className="rounded" />
                <span className="text-xs text-gray-600">Full access (*)</span>
              </label>
            </div>
            {!hasWildcard && (
              <div className="border rounded-lg p-3 space-y-3 max-h-48 overflow-y-auto">
                {Object.entries(grouped).map(([resource, perms]) => (
                  <div key={resource}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{resource}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((perm) => (
                        <label key={perm} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={permissions.includes(perm)}
                            onChange={() => togglePerm(perm)} className="rounded" />
                          <span className="text-xs text-gray-600">{perm.split(".")[1]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User modal ────────────────────────────────────────────────────────────

function UserModal({
  initial,
  roles,
  onSave,
  onClose,
}: {
  initial?: SecurityUser;
  roles: SecurityRole[];
  onSave: (u: SecurityUser) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [roleId, setRoleId] = useState(initial?.role_id ?? roles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) { setError("Name and email are required"); return; }
    setSaving(true);
    const res = initial
      ? await updateSecurityUser(initial.id, { name, email, role_id: roleId })
      : await createSecurityUser({ name, email, role_id: roleId });
    setSaving(false);
    if (res.success && res.data) onSave(res.data);
    else setError(res.error ?? "Save failed");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[400px] p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">{initial ? "Edit User" : "Invite User"}</h2>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
            {saving ? "Saving…" : initial ? "Save" : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New API Key modal ─────────────────────────────────────────────────────

function ApiKeyModal({
  roles,
  onSave,
  onClose,
}: {
  roles: SecurityRole[];
  onSave: (key: ApiKey) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await createApiKey({ name, role_id: roleId });
    setSaving(false);
    if (res.success && res.data) {
      setCreatedKey(res.data.key);
      onSave(res.data);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[440px] p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Create API Key</h2>
        {createdKey ? (
          <div className="space-y-3">
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              API key created. Copy it now — it won&apos;t be shown again.
            </p>
            <div className="bg-slate-800 rounded-lg px-4 py-3 font-mono text-xs text-green-300 break-all select-all">
              {createdKey}
            </div>
            <button onClick={onClose} className="w-full text-sm bg-blue-700 text-white py-2 rounded-lg font-medium hover:bg-blue-800">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Key name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production integration"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Role / Permission scope</label>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400 bg-white">
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !name.trim()}
                className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
                {saving ? "Creating…" : "Create Key"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Settings panel ────────────────────────────────────────────────────────

function SettingsPanel({ settings: initial }: { settings: SecuritySettings }) {
  const [settings, setSettings] = useState<SecuritySettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<SecuritySettings>) => { setSettings((s) => ({ ...s, ...patch })); setSaved(false); };

  const handleSave = async () => {
    setSaving(true);
    await updateSecuritySettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Authentication</h4>
        <label className="flex items-center justify-between gap-3 p-3 border rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-800">Require MFA</p>
            <p className="text-xs text-gray-400">Enforce two-factor authentication for all users</p>
          </div>
          <button onClick={() => update({ require_mfa: !settings.require_mfa })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${settings.require_mfa ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
              ${settings.require_mfa ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </label>
        <div className="p-3 border rounded-lg">
          <p className="text-sm font-medium text-gray-800 mb-1">Session timeout</p>
          <div className="flex items-center gap-2">
            <input type="number" value={settings.session_timeout_minutes} min={5}
              onChange={(e) => update({ session_timeout_minutes: parseInt(e.target.value) || 60 })}
              className="w-24 border rounded px-2 py-1 text-sm outline-none focus:ring-1 ring-blue-400 text-center" />
            <span className="text-sm text-gray-500">minutes</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">File Policy</h4>
        <div className="p-3 border rounded-lg">
          <p className="text-sm font-medium text-gray-800 mb-1">Max file size</p>
          <div className="flex items-center gap-2">
            <input type="number" value={settings.max_file_size_mb} min={1}
              onChange={(e) => update({ max_file_size_mb: parseInt(e.target.value) || 100 })}
              className="w-24 border rounded px-2 py-1 text-sm outline-none focus:ring-1 ring-blue-400 text-center" />
            <span className="text-sm text-gray-500">MB</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Audit & Logging</h4>
        <label className="flex items-center justify-between gap-3 p-3 border rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-800">Audit log enabled</p>
            <p className="text-xs text-gray-400">Track all user actions and file events</p>
          </div>
          <button onClick={() => update({ audit_log_enabled: !settings.audit_log_enabled })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${settings.audit_log_enabled ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
              ${settings.audit_log_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </label>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">IP Access Control</h4>
        <label className="flex items-center justify-between gap-3 p-3 border rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-800">IP whitelist</p>
            <p className="text-xs text-gray-400">Only allow access from specific IP addresses</p>
          </div>
          <button onClick={() => update({ ip_whitelist_enabled: !settings.ip_whitelist_enabled })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${settings.ip_whitelist_enabled ? "bg-blue-600" : "bg-gray-300"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
              ${settings.ip_whitelist_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </label>
        {settings.ip_whitelist_enabled && (
          <div className="p-3 border rounded-lg space-y-2">
            <p className="text-xs font-medium text-gray-600">Allowed IPs (one per line)</p>
            <textarea
              value={settings.ip_whitelist.join("\n")}
              onChange={(e) => update({ ip_whitelist: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              rows={4}
              placeholder="192.168.1.0/24&#10;10.0.0.1"
              className="w-full border rounded px-3 py-2 text-xs font-mono outline-none focus:ring-1 ring-blue-400 resize-none"
            />
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving}
        className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
        {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
      </button>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function SecurityConfiguration() {
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SectionTab>("users");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<SecurityRole | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SecurityUser | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getSecurityConfig();
    if (res.success && res.data) setConfig(res.data);
    setLoading(false);
  };

  if (loading || !config) return <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>;

  const roleName = (roleId: string) => config.roles.find((r) => r.id === roleId)?.name ?? roleId;

  const SECTION_TABS: { key: SectionTab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "roles", label: "Roles & Permissions" },
    { key: "api_keys", label: "API Keys" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Security Configuration</h3>
            <p className="text-xs text-gray-400 mt-0.5">Manage users, roles, API access, and platform security settings.</p>
          </div>
          {activeTab === "users" && (
            <button onClick={() => { setEditingUser(null); setShowUserModal(true); }}
              className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
              + Invite User
            </button>
          )}
          {activeTab === "roles" && (
            <button onClick={() => { setEditingRole(null); setShowRoleModal(true); }}
              className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
              + New Role
            </button>
          )}
          {activeTab === "api_keys" && (
            <button onClick={() => setShowKeyModal(true)}
              className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
              + Create Key
            </button>
          )}
        </div>

        {/* Section tabs */}
        <div className="border-b flex gap-0">
          {SECTION_TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap
                ${activeTab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Users */}
        {activeTab === "users" && (
          <div className="border rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Email</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {config.users.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-xs text-gray-400">No users yet.</td></tr>
                ) : config.users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50/60 group transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{user.name}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{user.email}</td>
                    <td className="px-3 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {roleName(user.role_id)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${user.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingUser(user); setShowUserModal(true); }}
                          className="text-gray-400 hover:text-blue-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button disabled={deletingId === user.id}
                          onClick={async () => {
                            setDeletingId(user.id);
                            const res = await deleteSecurityUser(user.id);
                            if (res.success) setConfig((c) => c ? { ...c, users: c.users.filter((u) => u.id !== user.id) } : c);
                            setDeletingId(null);
                          }}
                          className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Roles */}
        {activeTab === "roles" && (
          <div className="grid grid-cols-1 gap-3">
            {config.roles.map((role) => (
              <div key={role.id} className="border rounded-xl bg-white p-4 group hover:border-blue-200 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm">{role.name}</p>
                      {role.permissions.includes("*") && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">Full access</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingRole(role); setShowRoleModal(true); }}
                      className="text-gray-400 hover:text-blue-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button disabled={deletingId === role.id}
                      onClick={async () => {
                        setDeletingId(role.id);
                        const res = await deleteSecurityRole(role.id);
                        if (res.success) setConfig((c) => c ? { ...c, roles: c.roles.filter((r) => r.id !== role.id) } : c);
                        setDeletingId(null);
                      }}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                {!role.permissions.includes("*") && role.permissions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.permissions.map((p) => (
                      <span key={p} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* API Keys */}
        {activeTab === "api_keys" && (
          <div className="border rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Key</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-left px-3 py-3 font-medium">Created</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {config.api_keys.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-xs text-gray-400">No API keys yet.</td></tr>
                ) : config.api_keys.map((key) => (
                  <tr key={key.id} className="border-b last:border-0 hover:bg-gray-50/60 group transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{key.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{key.key}</td>
                    <td className="px-3 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {roleName(key.role_id)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${key.active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {key.active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {key.active && (
                          <button onClick={async () => {
                            const res = await revokeApiKey(key.id);
                            if (res.success) setConfig((c) => c ? {
                              ...c, api_keys: c.api_keys.map((k) => k.id === key.id ? { ...k, active: false } : k)
                            } : c);
                          }}
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium">Revoke</button>
                        )}
                        <button disabled={deletingId === key.id}
                          onClick={async () => {
                            setDeletingId(key.id);
                            const res = await deleteApiKey(key.id);
                            if (res.success) setConfig((c) => c ? { ...c, api_keys: c.api_keys.filter((k) => k.id !== key.id) } : c);
                            setDeletingId(null);
                          }}
                          className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Settings */}
        {activeTab === "settings" && <SettingsPanel settings={config.settings} />}
      </div>

      {showRoleModal && (
        <RoleModal
          initial={editingRole ?? undefined}
          allPermissions={config.all_permissions}
          onSave={(role) => {
            setConfig((c) => {
              if (!c) return c;
              const idx = c.roles.findIndex((r) => r.id === role.id);
              return { ...c, roles: idx >= 0 ? c.roles.map((r) => r.id === role.id ? role : r) : [...c.roles, role] };
            });
            setShowRoleModal(false);
          }}
          onClose={() => { setShowRoleModal(false); setEditingRole(null); }}
        />
      )}

      {showUserModal && (
        <UserModal
          initial={editingUser ?? undefined}
          roles={config.roles}
          onSave={(user) => {
            setConfig((c) => {
              if (!c) return c;
              const idx = c.users.findIndex((u) => u.id === user.id);
              return { ...c, users: idx >= 0 ? c.users.map((u) => u.id === user.id ? user : u) : [...c.users, user] };
            });
            setShowUserModal(false);
          }}
          onClose={() => { setShowUserModal(false); setEditingUser(null); }}
        />
      )}

      {showKeyModal && (
        <ApiKeyModal
          roles={config.roles}
          onSave={(key) => {
            setConfig((c) => c ? { ...c, api_keys: [...c.api_keys, { ...key, key: key.key.slice(0, 8) + "…" + key.key.slice(-4) }] } : c);
          }}
          onClose={() => setShowKeyModal(false)}
        />
      )}
    </>
  );
}
