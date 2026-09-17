"use client";

const FEATURES: { title: string; desc: string; bg: string; fg: string; icon: JSX.Element }[] = [
  {
    title: "AI-powered extraction",
    desc: "Point it at any Bill of Lading, invoice, or delivery order and get structured fields back — no manual data entry.",
    bg: "bg-amber-100", fg: "text-amber-600",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
  },
  {
    title: "Templates that learn",
    desc: "Every correction you make teaches future extractions — split a combined field once, and it stays split.",
    bg: "bg-rose-100", fg: "text-rose-500",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />,
  },
  {
    title: "Smart Inbox",
    desc: "Connect a mailbox and incoming documents are pulled in and filed automatically — no manual upload.",
    bg: "bg-orange-100", fg: "text-orange-500",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  },
  {
    title: "Split & merge on the fly",
    desc: "Break a multi-document PDF into individual jobs, or combine several into one, before or after extraction.",
    bg: "bg-teal-100", fg: "text-teal-600",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" />,
  },
  {
    title: "Rules & workflow automation",
    desc: "Auto-route documents through approval states and trigger actions the moment a field matches a condition.",
    bg: "bg-violet-100", fg: "text-violet-500",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
  },
  {
    title: "Duplicate & reconciliation checks",
    desc: "Catch duplicate filings and cross-check values across related documents automatically.",
    bg: "bg-fuchsia-100", fg: "text-fuchsia-500",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  },
  {
    title: "Push straight to your systems",
    desc: "Map extracted fields to any API or ERP endpoint, cast types on the way out, and push with one click.",
    bg: "bg-sky-100", fg: "text-sky-600",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
  },
  {
    title: "Built for teams",
    desc: "Every file is scoped to its owner, admins see everything, and a full audit trail tracks who changed what.",
    bg: "bg-emerald-100", fg: "text-emerald-600",
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 2a4 4 0 10-8 0" />,
  },
];

// A friendly, simplified mock of the real Files screen — stands in for a
// product screenshot without needing to ship/maintain an actual image.
function ProductPreview() {
  const rows = [
    { name: "Actual_BL_X26-00002.pdf", tpl: "Bill of Lading (Draft)", status: "Ready", pct: 100 },
    { name: "Outward_Cover_SHA001.pdf", tpl: "outward cover page 2", status: "Ready", pct: 100 },
    { name: "Transport_Invoice_0921.pdf", tpl: "Transport Invoice", status: "Review", pct: 60 },
  ];
  return (
    <div className="rounded-3xl bg-white shadow-xl shadow-orange-900/10 ring-1 ring-stone-100 overflow-hidden">
      <div className="flex items-center gap-1.5 px-5 py-3.5 bg-stone-50 border-b border-stone-100">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 text-[11px] text-stone-400 font-medium">Files</span>
      </div>
      <div className="flex">
        <div className="hidden sm:flex flex-col gap-2 w-12 py-4 px-3.5 border-r border-stone-100 bg-stone-50/60">
          {[true, false, false, false].map((active, i) => (
            <span key={i} className={`h-2 rounded-full ${active ? "bg-orange-400" : "bg-stone-200"}`} />
          ))}
        </div>
        <div className="flex-1 p-3 space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3 rounded-2xl border border-stone-100 px-3.5 py-3">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-stone-800 truncate">{r.name}</p>
                <p className="text-[10px] text-stone-400 truncate">{r.tpl}</p>
              </div>
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                r.status === "Ready" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
              }`}>{r.status}</span>
              <div className="hidden sm:block w-14 h-1.5 rounded-full bg-stone-100 overflow-hidden flex-shrink-0">
                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  const logoMark = (
    <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-rose-400 rounded-2xl flex items-center justify-center shadow-sm shadow-orange-200 flex-shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#FFFBF5] font-sans">
      {/* Soft organic background blobs, warm palette */}
      <div className="absolute top-0 inset-x-0 h-[46rem] overflow-hidden -z-10">
        <div className="absolute -top-24 -left-20 w-[30rem] h-[30rem] bg-orange-200/50 rounded-full blur-[100px]" />
        <div className="absolute top-10 right-0 w-[26rem] h-[26rem] bg-rose-200/40 rounded-full blur-[100px]" />
        <div className="absolute top-64 left-1/3 w-72 h-72 bg-sky-200/30 rounded-full blur-[90px]" />
      </div>

      <header className="relative flex items-center justify-between px-6 sm:px-10 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          {logoMark}
          <div>
            <p className="text-sm font-bold text-stone-900 leading-tight">AI PDF Studio</p>
            <p className="text-xs text-stone-400 leading-tight">Document Intelligence</p>
          </div>
        </div>
        <button onClick={onSignIn}
          className="text-sm font-semibold text-stone-700 border border-stone-200 bg-white px-4 py-2 rounded-2xl hover:border-orange-300 hover:text-orange-600 transition-colors">
          Sign In
        </button>
      </header>

      <section className="relative max-w-6xl mx-auto px-6 sm:px-10 pt-10 pb-20 sm:pt-14 text-center">
        <span className="inline-block text-xs font-semibold text-orange-700 bg-orange-100 rounded-full px-3.5 py-1.5 mb-7">
          🗂️ Internal document workspace
        </span>
        <h1 className="text-4xl sm:text-6xl font-bold text-stone-900 leading-[1.1] tracking-tight max-w-3xl mx-auto">
          Document intelligence, on <span className="relative inline-block">
            autopilot
            <svg className="absolute -bottom-1.5 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none">
              <path d="M2 7.5C40 2 160 2 198 7.5" stroke="#FB923C" strokeWidth="5" strokeLinecap="round" fill="none" />
            </svg>
          </span>.
        </h1>
        <p className="text-base sm:text-lg text-stone-500 max-w-xl mx-auto mt-7 leading-relaxed">
          Extract, reconcile, and route data from shipping and trade documents straight into
          the systems your team already runs — with every correction making the next extraction a little smarter.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <button onClick={onSignIn}
            className="bg-gradient-to-br from-orange-500 to-rose-500 text-white px-7 py-3.5 rounded-2xl text-sm font-semibold shadow-lg shadow-orange-300/50 hover:shadow-orange-300/70 hover:-translate-y-0.5 transition-all">
            Sign In to Continue
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-4">
          Access is admin-managed — ask your workspace admin for an account.
        </p>
      </section>

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10 mb-20 sm:mb-28">
        <ProductPreview />
      </div>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900">Everything document ops needs</h2>
          <p className="text-sm text-stone-500 mt-2">From first upload to a clean record in your system of record.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-4 bg-white rounded-3xl border border-stone-100 p-6 hover:shadow-lg hover:shadow-stone-200/60 hover:-translate-y-0.5 transition-all">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${f.bg}`}>
                <svg className={`w-5 h-5 ${f.fg}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {f.icon}
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 mb-1">{f.title}</p>
                <p className="text-sm text-stone-500 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-100">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-6 flex items-center justify-between">
          <p className="text-xs text-stone-400">&copy; 2026 AI PDF Studio</p>
          <button onClick={onSignIn} className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors">
            Sign In &rarr;
          </button>
        </div>
      </footer>
    </div>
  );
}
