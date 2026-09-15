"use client";

import { useEffect, useRef, useState } from "react";
import {
  getLibraries, createLibrary, updateLibrary, deleteLibrary,
  addLibraryRow, updateLibraryRow, deleteLibraryRow, importLibraryCSV,
  reindexLibrary, getLibraryCache, clearLibraryCache, deleteLibraryCacheRow,
} from "@/lib/api";
import type { Library } from "@/lib/api";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Create / Edit library modal ──────────────────────────────────────────

function LibraryModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Library;
  onSave: (lib: Library) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [columnsRaw, setColumnsRaw] = useState((initial?.columns ?? ["key", "value"]).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    const columns = columnsRaw.split(",").map((c) => c.trim()).filter(Boolean);
    if (!columns.length) { setError("At least one column is required"); return; }
    setSaving(true);
    const res = initial
      ? await updateLibrary(initial.id, { name, description, columns })
      : await createLibrary({ name, description, columns });
    setSaving(false);
    if (res.success && res.data) onSave(res.data);
    else setError(res.error ?? "Save failed");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">{initial ? "Edit Library" : "New Library"}</h2>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        <div className="space-y-3">
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
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Columns <span className="text-gray-400">(comma-separated)</span></label>
            <input value={columnsRaw} onChange={(e) => setColumnsRaw(e.target.value)}
              placeholder="e.g. code, label, region"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-400" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-gray-500 border rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row editor (inline) ──────────────────────────────────────────────────

function InlineRowForm({
  columns,
  initial,
  onSave,
  onCancel,
}: {
  columns: string[];
  initial?: Record<string, string>;
  onSave: (row: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(columns.map((c) => [c, initial?.[c] ?? ""]))
  );

  return (
    <tr className="bg-blue-50">
      {columns.map((col) => (
        <td key={col} className="px-3 py-2">
          <input value={values[col] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [col]: e.target.value }))}
            className="w-full text-xs border rounded px-2 py-1 outline-none focus:ring-1 ring-blue-400 bg-white" />
        </td>
      ))}
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={() => onSave(values)} className="text-xs text-blue-700 font-medium hover:underline mr-2">Save</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </td>
    </tr>
  );
}

// ─── Library detail view ──────────────────────────────────────────────────

function LibraryDetail({
  library: initial,
  onBack,
  onUpdated,
}: {
  library: Library;
  onBack: () => void;
  onUpdated: (lib: Library) => void;
}) {
  const [library, setLibrary] = useState<Library>(initial);
  const [addingRow, setAddingRow] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reindexing, setReindexing] = useState(false);
  const [showCache, setShowCache] = useState(false);
  const [cacheRows, setCacheRows] = useState<Array<Record<string, string>>>([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sync = (lib: Library) => { setLibrary(lib); onUpdated(lib); };

  const handleReindex = async () => {
    setReindexing(true);
    const res = await reindexLibrary(library.id);
    setReindexing(false);
    if (res.success && res.data) sync(res.data);
  };

  const loadCache = async () => {
    setCacheLoading(true);
    const res = await getLibraryCache(library.id);
    if (res.success && res.data) setCacheRows(res.data);
    setCacheLoading(false);
  };

  const handleShowCache = () => { setShowCache(true); loadCache(); };

  const handleClearCache = async () => {
    setClearingCache(true);
    const res = await clearLibraryCache(library.id);
    setClearingCache(false);
    if (res.success) setCacheRows([]);
  };

  const handleDeleteCacheRow = async (cacheRowId: string) => {
    const res = await deleteLibraryCacheRow(library.id, cacheRowId);
    if (res.success) setCacheRows((prev) => prev.filter((r) => r._id !== cacheRowId));
  };

  const handleAddRow = async (row: Record<string, string>) => {
    const res = await addLibraryRow(library.id, row);
    if (res.success && res.data) { sync(res.data); setAddingRow(false); }
  };

  const handleUpdateRow = async (rowId: string, row: Record<string, string>) => {
    const res = await updateLibraryRow(library.id, rowId, row);
    if (res.success && res.data) { sync(res.data); setEditingRowId(null); }
  };

  const handleDeleteRow = async (rowId: string) => {
    const res = await deleteLibraryRow(library.id, rowId);
    if (res.success && res.data) sync(res.data);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    const text = await file.text();
    const res = await importLibraryCSV(library.id, text);
    setImporting(false);
    if (res.success && res.data) sync(res.data);
    else setImportError(res.error ?? "Import failed");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filtered = library.rows.filter((row) =>
    !search || library.columns.some((col) => (row[col] ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800">{library.name}</h3>
          {library.description && <p className="text-xs text-gray-400 mt-0.5">{library.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {showCache ? (
            <>
              <button onClick={handleClearCache} disabled={clearingCache || cacheRows.length === 0}
                className="text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 transition-colors">
                {clearingCache ? "Clearing…" : "Clear Cache"}
              </button>
              <button onClick={() => setShowCache(false)}
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
                Show Main
              </button>
            </>
          ) : (
            <>
              <button onClick={handleReindex} disabled={reindexing}
                className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {reindexing ? "Indexing…" : "Reindex Search"}
              </button>
              <button onClick={handleShowCache}
                className="text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors">
                Show Cache{library.cache && library.cache.length > 0 ? ` (${library.cache.length})` : ""}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              <button onClick={() => fileInputRef.current?.click()} disabled={importing}
                className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {importing ? "Importing…" : "Import CSV"}
              </button>
              <button onClick={() => setAddingRow(true)}
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
                + Add Row
              </button>
            </>
          )}
        </div>
      </div>

      {importError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{importError}</p>}

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span><span className="font-semibold text-gray-800">{library.rows.length}</span> rows</span>
        <span><span className="font-semibold text-gray-800">{library.columns.length}</span> columns: {library.columns.join(", ")}</span>
        {library.last_indexed_at && (
          <span>Indexed {formatTimestamp(library.last_indexed_at)} ({library.indexed_row_count} rows)</span>
        )}
      </div>

      {showCache ? (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b bg-gray-50 text-xs font-semibold text-gray-600">
            {library.name} Cache
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  {library.columns.map((col) => (
                    <th key={col} className="text-left px-3 py-3 font-medium capitalize">{col}</th>
                  ))}
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cacheLoading ? (
                  <tr><td colSpan={library.columns.length + 1} className="py-10 text-center text-xs text-gray-400">Loading…</td></tr>
                ) : cacheRows.length === 0 ? (
                  <tr><td colSpan={library.columns.length + 1} className="py-10 text-center text-xs text-gray-400">
                    Cache is empty. Cached entries appear here after a field lookup matches a row.
                  </td></tr>
                ) : (
                  cacheRows.map((row) => (
                    <tr key={row._id} className="border-b last:border-0 hover:bg-gray-50/60 group transition-colors">
                      {library.columns.map((col) => (
                        <td key={col} className="px-3 py-2.5 text-xs text-gray-700">{row[col] ?? ""}</td>
                      ))}
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => handleDeleteCacheRow(row._id)}
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      ) : (
        <>
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows…"
          className="w-full border-b pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-400 bg-transparent" />
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                {library.columns.map((col) => (
                  <th key={col} className="text-left px-3 py-3 font-medium capitalize">{col}</th>
                ))}
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <InlineRowForm columns={library.columns} onSave={handleAddRow} onCancel={() => setAddingRow(false)} />
              )}
              {filtered.length === 0 && !addingRow ? (
                <tr>
                  <td colSpan={library.columns.length + 1} className="py-10 text-center text-xs text-gray-400">
                    {search ? "No rows match your search." : "No rows yet. Add a row or import a CSV."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const rowId = row._id;
                  if (editingRowId === rowId) {
                    return (
                      <InlineRowForm key={rowId} columns={library.columns} initial={row}
                        onSave={(updated) => handleUpdateRow(rowId, updated)}
                        onCancel={() => setEditingRowId(null)} />
                    );
                  }
                  return (
                    <tr key={rowId} className="border-b last:border-0 hover:bg-gray-50/60 group transition-colors">
                      {library.columns.map((col) => (
                        <td key={col} className="px-3 py-2.5 text-xs text-gray-700">{row[col] ?? ""}</td>
                      ))}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingRowId(rowId)} className="text-gray-400 hover:text-blue-600 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteRow(rowId)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────

export default function LibraryDashboard() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLib, setEditingLib] = useState<Library | null>(null);
  const [selectedLib, setSelectedLib] = useState<Library | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const res = await getLibraries();
    if (res.success && res.data) setLibraries(res.data);
    setLoading(false);
  };

  const handleSaved = (lib: Library) => {
    setLibraries((prev) => {
      const idx = prev.findIndex((l) => l.id === lib.id);
      return idx >= 0 ? prev.map((l) => l.id === lib.id ? lib : l) : [...prev, lib];
    });
    setShowModal(false);
    setEditingLib(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteLibrary(id);
    if (res.success) setLibraries((prev) => prev.filter((l) => l.id !== id));
    setDeletingId(null);
  };

  const handleUpdated = (lib: Library) => {
    setLibraries((prev) => prev.map((l) => l.id === lib.id ? lib : l));
    setSelectedLib(lib);
  };

  if (selectedLib) {
    return (
      <LibraryDetail
        library={selectedLib}
        onBack={() => setSelectedLib(null)}
        onUpdated={handleUpdated}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Basic Library</h3>
            <p className="text-xs text-gray-400 mt-0.5">Reference data tables used in rule conditions and field validation.</p>
          </div>
          <button onClick={() => { setEditingLib(null); setShowModal(true); }}
            className="text-sm bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-800 transition-colors">
            + New Library
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : libraries.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-16 text-center">
            <div className="text-gray-300 mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No libraries yet.</p>
            <p className="text-xs text-gray-400 mt-1">Create a library to store reference data like port codes, currency lists, or carrier names.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {libraries.map((lib) => (
              <div key={lib.id}
                className="border rounded-xl bg-white p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                onClick={() => setSelectedLib(lib)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="bg-blue-50 text-blue-700 p-2 rounded-lg">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4-8 4s8 1.79 8 4" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditingLib(lib); setShowModal(true); }}
                      className="text-gray-300 hover:text-blue-600 transition-colors p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(lib.id)} disabled={deletingId === lib.id}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1 disabled:opacity-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <h4 className="font-semibold text-gray-800 text-sm">{lib.name}</h4>
                {lib.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{lib.description}</p>}

                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    {lib.rows.length} rows
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                    {lib.columns.length} cols
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {lib.columns.slice(0, 4).map((col) => (
                    <span key={col} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{col}</span>
                  ))}
                  {lib.columns.length > 4 && (
                    <span className="text-[10px] text-gray-400">+{lib.columns.length - 4} more</span>
                  )}
                </div>

                <p className="text-[10px] text-gray-300 mt-3">
                  Updated {new Date(lib.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <LibraryModal
          initial={editingLib ?? undefined}
          onSave={handleSaved}
          onClose={() => { setShowModal(false); setEditingLib(null); }}
        />
      )}
    </>
  );
}
