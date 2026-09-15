"use client";

import { useState, useRef, useEffect } from "react";
import { uploadPdf, suggestTemplate, globalSearch, getMe, logout as apiLogout, setUnauthorizedHandler } from "@/lib/api";
import type { UploadResult, GlobalSearchResult, AuthUser } from "@/lib/api";
import LoginPage from "@/components/LoginPage";
import UserManager from "@/components/UserManager";
import FileUploadZone from "@/components/FileUploadZone";
import SplitPanel from "@/components/SplitPanel";
import MergePanel from "@/components/MergePanel";
import AICommandBar from "@/components/AICommandBar";
import TemplatesPanel from "@/components/TemplatesPanel";
import ShippingPanel from "@/components/ShippingPanel";
import DocumentGroupPanel from "@/components/DocumentGroupPanel";
import FileDashboard from "@/components/FileDashboard";
import WorkflowConfig from "@/components/WorkflowConfig";
import RuleDashboard from "@/components/RuleDashboard";
import LibraryDashboard from "@/components/LibraryDashboard";
import SecurityConfiguration from "@/components/SecurityConfig";
import ExportPanel from "@/components/ExportPanel";
import AuditLog from "@/components/AuditLog";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import DuplicatesPanel from "@/components/DuplicatesPanel";
import NotificationBell from "@/components/NotificationBell";
import ReconciliationPanel from "@/components/ReconciliationPanel";
import LearningDashboard from "@/components/LearningDashboard";
import DocumentTypeConfig from "@/components/DocumentTypeConfig";
import SmartInbox from "@/components/SmartInbox";

type Tab =
  | "split" | "merge" | "ai" | "templates" | "shipping" | "inbox"
  | "documents" | "files" | "workflow" | "rules" | "library" | "learning" | "docTypes"
  | "security" | "export" | "audit" | "analytics" | "duplicates" | "reconciliation";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ── Icons ─────────────────────────────────────────────────────────────────

function IconFiles() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
function IconTemplate() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 9a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm9-9a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 9a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}
function IconAI() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}
function IconSplit() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  );
}
function IconMerge() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function IconShipping() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  );
}
function IconDocs() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}
function IconWorkflow() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function IconRules() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
function IconLibrary() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
function IconSecurity() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconExport() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
function IconAudit() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
function IconDuplicates() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
function IconReconcile() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
function IconDocType() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M7 11h10M7 15h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  );
}
function IconLearning() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 20.055a12.083 12.083 0 01-6.16-9.478L12 14zm0 0v7" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
function IconPDF() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ── Nav structure ──────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { key: "files" as Tab, label: "Files", icon: IconFiles },
      { key: "templates" as Tab, label: "Templates", icon: IconTemplate },
      { key: "inbox" as Tab, label: "Smart Inbox", icon: IconInbox },
    ],
  },
  {
    label: "AI Tools",
    items: [
      { key: "ai" as Tab, label: "AI Commands", icon: IconAI },
      // "Doc Groups" and "Shipping Docs" hidden for now — their features
      // clash with the Files screen. Tab content/routes are left intact
      // below so this is just a nav-visibility change, easy to restore.
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "split" as Tab, label: "Split", icon: IconSplit },
      { key: "merge" as Tab, label: "Merge", icon: IconMerge },
    ],
  },
  {
    label: "Configuration",
    items: [
      { key: "workflow" as Tab, label: "Workflow", icon: IconWorkflow },
      { key: "rules" as Tab, label: "Rules", icon: IconRules },
      { key: "library" as Tab, label: "Library", icon: IconLibrary },
      { key: "docTypes" as Tab, label: "Document Types", icon: IconDocType },
      { key: "learning" as Tab, label: "Learning Module", icon: IconLearning },
      { key: "security" as Tab, label: "Security", icon: IconSecurity },
    ],
  },
  {
    label: "Insights",
    items: [
      { key: "analytics" as Tab, label: "Analytics", icon: IconAnalytics },
      { key: "duplicates" as Tab, label: "Duplicates", icon: IconDuplicates },
      { key: "reconciliation" as Tab, label: "Reconcile", icon: IconReconcile },
      { key: "export" as Tab, label: "Export", icon: IconExport },
      { key: "audit" as Tab, label: "Audit Log", icon: IconAudit },
    ],
  },
];

const PAGE_TITLES: Record<Tab, string> = {
  inbox: "Smart Inbox",
  files: "Files", templates: "Templates", ai: "AI Commands",
  documents: "Document Groups", shipping: "Shipping Docs",
  split: "Split PDF", merge: "Merge PDFs", workflow: "Workflow",
  rules: "Rules", library: "Library", learning: "Learning Module",
  docTypes: "Document Types",
  security: "Security", export: "Export", audit: "Audit Log",
  analytics: "Analytics", duplicates: "Duplicates", reconciliation: "Reconcile",
};

// ── Compact upload card ────────────────────────────────────────────────────

function UploadCard({
  uploadResult,
  uploading,
  uploadError,
  onFiles,
  onClear,
}: {
  uploadResult: UploadResult | null;
  uploading: boolean;
  uploadError: string | null;
  onFiles: (files: File[]) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  if (uploadResult) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#ECECEC] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex-shrink-0 w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
          <IconPDF />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{uploadResult.filename}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {uploadResult.page_count} pages · {formatBytes(uploadResult.size_bytes)} · <span className="text-emerald-600 font-medium">Ready</span>
          </p>
        </div>
        <button
          onClick={onClear}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-[#ECECEC] rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-all duration-150 font-medium"
        >
          Replace
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
        ${dragging
          ? "border-blue-400 bg-blue-50/60"
          : uploading
            ? "border-blue-200 bg-blue-50/30"
            : "border-[#DCDCDC] bg-white hover:border-blue-300 hover:bg-blue-50/20"
        }`}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg,.tiff"
        className="hidden"
        onChange={(e) => { const f = e.target.files; if (f?.length) onFiles(Array.from(f)); }}
      />

      {uploading ? (
        <div className="w-9 h-9 flex items-center justify-center">
          <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
          <IconUpload />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {uploading ? (
          <>
            <p className="text-sm font-semibold text-blue-700 leading-tight">Uploading &amp; analysing…</p>
            <div className="mt-1.5 h-1 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700 leading-tight">
              {dragging ? "Drop to upload" : "Drop PDF here or"}{" "}
              {!dragging && <span className="text-blue-600 underline underline-offset-2">browse</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel, PNG, JPG, TIFF</p>
          </>
        )}
      </div>

      {uploadError && (
        <p className="text-xs text-red-500 font-medium">{uploadError}</p>
      )}
    </div>
  );
}

// ── Global search ──────────────────────────────────────────────────────────

function GlobalSearch({
  onOpenFile,
  onOpenInbox,
}: {
  onOpenFile: (fileId: string) => void;
  onOpenInbox: (subject: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await globalSearch(query.trim());
      if (res.success && res.data) setResults(res.data);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = results && (results.files.length > 0 || results.inbox.length > 0);

  return (
    <div className="relative w-64 flex-shrink-0" ref={ref}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search files, inbox…"
        className="w-full pl-9 pr-3 py-2 text-sm border border-[#ECECEC] rounded-xl outline-none focus:ring-2 ring-blue-400 bg-white"
      />
      {open && query.trim() && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-[#ECECEC] shadow-lg py-1.5 z-50 max-h-80 overflow-y-auto">
          {searching ? (
            <p className="px-3.5 py-3 text-xs text-gray-400">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3.5 py-3 text-xs text-gray-400">No matches.</p>
          ) : (
            <>
              {results!.files.length > 0 && (
                <div>
                  <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Files</p>
                  {results!.files.map((f) => (
                    <button key={f.id} onClick={() => { onOpenFile(f.id); setOpen(false); setQuery(""); }}
                      className="w-full flex flex-col items-start px-3.5 py-2 text-left hover:bg-gray-50 transition-colors">
                      <span className="text-sm text-gray-800 truncate w-full">{f.filename}</span>
                      {f.template_name && <span className="text-xs text-gray-400">{f.template_name}</span>}
                    </button>
                  ))}
                </div>
              )}
              {results!.inbox.length > 0 && (
                <div>
                  <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Smart Inbox</p>
                  {results!.inbox.map((r) => (
                    <button key={r.id} onClick={() => { onOpenInbox(r.subject); setOpen(false); setQuery(""); }}
                      className="w-full flex flex-col items-start px-3.5 py-2 text-left hover:bg-gray-50 transition-colors">
                      <span className="text-sm text-gray-800 truncate w-full">{r.subject}</span>
                      <span className="text-xs text-gray-400 truncate w-full">{r.from}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── User menu ────────────────────────────────────────────────────────────

function UserMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors">
        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#ECECEC] rounded-xl shadow-lg py-1.5 z-50">
          <div className="px-3 py-2 border-b border-[#ECECEC]">
            <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
            <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
          </div>
          {user.role === "admin" && (
            <button onClick={() => { setShowUsers(true); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
              Manage Users
            </button>
          )}
          <button onClick={onLogout}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">
            Log out
          </button>
        </div>
      )}
      {showUsers && <UserManager currentUserId={user.id} onClose={() => setShowUsers(false)} />}
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────

function AppShell({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("files");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusFileIds, setFocusFileIds] = useState<string[] | null>(null);
  const [inboxSearch, setInboxSearch] = useState<string | undefined>(undefined);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    setFile(f);
    const res = await uploadPdf(f);
    setUploading(false);
    if (res.success && res.data) {
      setUploadResult(res.data);
      // Fire-and-forget: suggest a matching template in the background so it's
      // ready (persisted on the file record) by the time the user checks the
      // Files list — doesn't block the upload UI.
      suggestTemplate(res.data.file_id).catch(() => {});
      // The header uploader only renders on the Files tab now (every other
      // tab has its own dedicated uploader), so a header upload always means
      // "jump to this file's detail view to pick a template and extract."
      setFocusFileIds([res.data.file_id]);
      setTab("files");
    } else {
      setUploadError(res.error || "Upload failed");
      setFile(null);
    }
  };

  return (
    <div className="flex h-screen bg-[#FAFAFB] overflow-hidden font-sans">

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside
        className={`flex-shrink-0 flex flex-col bg-white border-r border-[#ECECEC] transition-all duration-300 ease-in-out ${sidebarCollapsed ? "w-[60px]" : "w-[220px]"}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[#ECECEC]">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[13px] font-bold text-gray-900 leading-tight whitespace-nowrap">AI PDF Studio</p>
              <p className="text-[10px] text-gray-400 leading-tight whitespace-nowrap">Document Intelligence</p>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-1.5">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ key, label, icon: Icon }) => {
                  const active = tab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      title={sidebarCollapsed ? label : undefined}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150
                        ${active
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                        }`}
                    >
                      <span className={`flex-shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`}>
                        <Icon />
                      </span>
                      {!sidebarCollapsed && (
                        <span className="truncate">{label}</span>
                      )}
                      {active && !sidebarCollapsed && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-[#ECECEC]">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors duration-150 text-xs font-medium"
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center gap-4 px-8 py-4 bg-white border-b border-[#ECECEC]">
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-gray-900 leading-tight">{PAGE_TITLES[tab]}</h1>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">
              AI-powered document extraction and automation
            </p>
          </div>

          <GlobalSearch
            onOpenFile={(fileId) => { setTab("files"); setFocusFileIds([fileId]); }}
            onOpenInbox={(subject) => { setTab("inbox"); setInboxSearch(subject); }}
          />

          {/* Upload zone — compact in header. Only shown on the Files tab —
              every other tab now has its own dedicated uploader, so there's
              only ever one obvious place to drop a file for any given task. */}
          {tab === "files" && (
            <div className="w-[340px] flex-shrink-0">
              <UploadCard
                uploadResult={uploadResult}
                uploading={uploading}
                uploadError={uploadError}
                onFiles={handleFile}
                onClear={() => { setUploadResult(null); setFile(null); }}
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-shrink-0">
            <NotificationBell />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* No overflow-hidden here: every tab's content is padded well clear
              of these rounded corners (checked — nothing bleeds to the edge),
              and this div sits between the file detail view's sticky "Original
              document" panel and the actual scrolling <main> above. Even
              without a visible scrollbar, overflow-hidden still establishes a
              scroll container, which becomes the sticky positioning reference
              instead of <main> — so the panel would never visually stick. */}
          <div className="bg-white rounded-2xl border border-[#ECECEC] shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
            <div className="p-6 lg:p-8">
              {tab === "inbox" && (
                <SmartInbox
                  onOpenFiles={(fileIds) => { setTab("files"); setFocusFileIds(fileIds); }}
                  initialSearch={inboxSearch}
                />
              )}
              {tab === "files" && (
                <FileDashboard
                  focusFileIds={focusFileIds}
                  onFocusHandled={() => setFocusFileIds(null)}
                />
              )}
              {tab === "workflow" && <WorkflowConfig />}
              {tab === "rules" && <RuleDashboard />}
              {tab === "library" && <LibraryDashboard />}
              {tab === "learning" && <LearningDashboard />}
              {tab === "docTypes" && <DocumentTypeConfig />}
              {tab === "security" && <SecurityConfiguration />}
              {tab === "export" && <ExportPanel />}
              {tab === "audit" && <AuditLog />}
              {tab === "analytics" && <AnalyticsDashboard />}
              {tab === "duplicates" && <DuplicatesPanel />}
              {tab === "reconciliation" && <ReconciliationPanel />}
              {tab === "merge" && <MergePanel />}
              {tab === "templates" && <TemplatesPanel />}
              {tab === "shipping" && <ShippingPanel />}

              {tab === "split" && (
                <SplitPanel onProcessed={(fileIds) => { setTab("files"); setFocusFileIds(fileIds); }} />
              )}

              {tab === "ai" && <AICommandBar />}

              {tab === "documents" && <DocumentGroupPanel />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Auth gate ──────────────────────────────────────────────────────────────
// Every request now requires a valid session — check it once on load, and
// drop back to the login screen if a session ever expires mid-use.

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe().then((res) => {
      setUser(res.success && res.data ? res.data : null);
      setChecking(false);
    });
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleLogout = async () => {
    await apiLogout();
    setUser(null);
  };

  if (checking) {
    return <div className="flex h-screen items-center justify-center bg-[#FAFAFB] text-sm text-gray-400">Loading…</div>;
  }

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }

  return <AppShell user={user} onLogout={handleLogout} />;
}
