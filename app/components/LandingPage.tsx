"use client";

import { Instrument_Serif } from "next/font/google";

// Geist Sans/Mono are already loaded app-wide in app/layout.tsx as CSS vars
// (--font-geist-sans / --font-geist-mono) but unused at the body level, since
// the rest of the app deliberately stays on a plain system-sans look —
// applied locally here instead of touching the global font-family.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const sans: React.CSSProperties = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" };
const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" };

export default function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-[#0c0d0b] text-[#faf8f3] antialiased" style={sans}>
      {/* Nav */}
      <header className="sticky top-0 z-20 backdrop-blur-2xl bg-[#0c0d0b]/72 border-b border-white/[0.06]">
        <div className="w-[min(1120px,calc(100%-40px))] mx-auto flex items-center justify-between h-[68px]">
          <button onClick={onSignIn} className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-[#e8a05a] to-[#c45c26] grid place-items-center ring-1 ring-inset ring-white/10 flex-shrink-0">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="#1a1c16" strokeWidth={2}>
                <path d="M7 3.5h7l4 4V20.5H7z" />
                <path d="M14 3.5V8h4.5" />
                <path d="M9.5 13h5M9.5 16.5h3.5" />
              </svg>
            </div>
            <div className="flex flex-col leading-[1.15] text-left">
              <strong className="text-sm font-semibold tracking-tight text-[#faf8f3]">AI PDF Studio</strong>
              <span className="text-[11px] text-[#9aa08f] tracking-wide">Document intelligence</span>
            </div>
          </button>
          <div className="flex items-center gap-2.5">
            <a href="#how" className="hidden sm:inline-block text-[13px] text-[#c9ccbf] hover:text-white px-3 py-2 rounded-lg transition-colors">
              How it works
            </a>
            <button onClick={onSignIn}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-[#f4efe4] text-[#1a1c16] text-[13.5px] font-semibold tracking-tight hover:bg-white hover:-translate-y-px transition-all">
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="w-[min(1120px,calc(100%-40px))] mx-auto pt-12 sm:pt-[72px] pb-9 text-center">
        <div className="inline-flex items-center gap-2 text-xs tracking-[.04em] uppercase text-[#e8a05a] border border-[#e8a05a]/28 bg-[#e8a05a]/[0.08] px-3 py-1.5 rounded-full mb-5 sm:mb-[22px]">
          Internal workspace &middot; shipping &amp; trade
        </div>
        <h1 className={`${instrumentSerif.className} text-[42px] sm:text-[64px] lg:text-[76px] font-normal tracking-[-.03em] leading-[.98] max-w-[16ch] mx-auto mb-5 sm:mb-[22px]`}>
          Documents that teach the next extraction{" "}
          <span className={`${instrumentSerif.className} italic text-[#e8a05a]`}>as you go.</span>
        </h1>
        <p className="max-w-[58ch] mx-auto mb-7 text-[#b7bbaf] text-base sm:text-[17px] leading-relaxed">
          Extract, reconcile, and route Bills of Lading, invoices, and cover pages
          into the systems you already run. Every correction becomes template memory.
        </p>
        <div className="flex flex-col items-center gap-2.5">
          <button onClick={onSignIn}
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-[10px] bg-[#c45c26] text-white text-[13.5px] font-semibold tracking-tight shadow-[0_8px_24px_rgba(196,92,38,.28)] hover:bg-[#d4682c] hover:-translate-y-px transition-all">
            Continue to workspace
          </button>
          <p className="text-[12.5px] text-[#7d8276]">Already a customer? Sign in. New to AI PDF Studio? Contact us to set up your company.</p>
        </div>
      </section>

      {/* Product stage */}
      <section id="how" className="w-[min(1120px,calc(100%-40px))] mx-auto pt-5 pb-16 sm:pb-20">
        <div className="bg-[#141512] border border-[#2a2c26] rounded-[18px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,.45)]">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#2a2c26] bg-[#171814]">
            <div className="flex gap-1.5 flex-shrink-0">
              <i className="w-2 h-2 rounded-full bg-[#3a3c34] block" />
              <i className="w-2 h-2 rounded-full bg-[#3a3c34] block" />
              <i className="w-2 h-2 rounded-full bg-[#3a3c34] block" />
            </div>
            <div className="text-[11.5px] text-[#8b907f] truncate" style={mono}>
              Outward_Cover_SHA001.pdf &middot; page 1 of 2 &middot; template: Bill of Lading
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr]">
            {/* Document pane */}
            <div className="bg-[#1b1d18] lg:border-r border-b lg:border-b-0 border-[#2a2c26] p-4 sm:p-[22px]">
              <article className="bg-[#f4efe4] text-[#1a1c16] rounded-lg p-6 sm:p-[28px_30px] shadow-[0_10px_30px_rgba(0,0,0,.25)] text-[12.5px]">
                <div className="flex justify-between items-baseline text-[10px] tracking-[.14em] uppercase text-[#7a7364] mb-[18px]">
                  <span>Sample · Ocean Bill of Lading</span>
                  <span>BL-X26-00002</span>
                </div>
                <h3 className={`${instrumentSerif.className} text-[26px] font-normal mb-1`}>Example Carrier Co.</h3>
                <p className="text-[#6b6558] mb-[22px] text-xs">Port of loading &middot; Shanghai &nbsp;&rarr;&nbsp; Port of discharge &middot; Lagos</p>
                <dl className="grid grid-cols-2 gap-x-[18px] gap-y-2.5 mb-5">
                  <div><dt className="text-[10px] uppercase tracking-[.08em] text-[#8a8374]">Shipper</dt><dd className="font-semibold">Example Shipper Ltd.</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-[.08em] text-[#8a8374]">Consignee</dt><dd className="font-semibold">Example Consignee Inc.</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-[.08em] text-[#8a8374]">Vessel / Voyage</dt><dd className="font-semibold">MV Harmattan / 26W38</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-[.08em] text-[#8a8374]">On board</dt><dd className="font-semibold">12 Sep 2026</dd></div>
                </dl>
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] tracking-[.08em] uppercase text-[#8a8374] py-1.5 border-b border-[#e6dfd0] font-normal">Marks</th>
                      <th className="text-left text-[10px] tracking-[.08em] uppercase text-[#8a8374] py-1.5 border-b border-[#e6dfd0] font-normal">Description</th>
                      <th className="text-right text-[10px] tracking-[.08em] uppercase text-[#8a8374] py-1.5 border-b border-[#e6dfd0] font-normal">Pkgs</th>
                      <th className="text-right text-[10px] tracking-[.08em] uppercase text-[#8a8374] py-1.5 border-b border-[#e6dfd0] font-normal">G.W. kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 border-b border-[#eee6d6] whitespace-nowrap">HG / LOS</td>
                      <td className="py-2 border-b border-[#eee6d6]">
                        <span className="bg-[#f3d2b0] shadow-[0_0_0_3px_#f3d2b0] rounded-[2px]">STC: industrial fasteners, mixed cartons</span>
                      </td>
                      <td className="py-2 border-b border-[#eee6d6] text-right tabular-nums">240</td>
                      <td className="py-2 border-b border-[#eee6d6] text-right tabular-nums">12,480</td>
                    </tr>
                    <tr>
                      <td className="py-2 border-b border-[#eee6d6]">&mdash;</td>
                      <td className="py-2 border-b border-[#eee6d6]">Said to contain, shipper&apos;s load &amp; count</td>
                      <td className="py-2 border-b border-[#eee6d6] text-right tabular-nums">&mdash;</td>
                      <td className="py-2 border-b border-[#eee6d6] text-right tabular-nums">&mdash;</td>
                    </tr>
                  </tbody>
                </table>
              </article>
            </div>

            {/* Extraction pane */}
            <div className="p-4 sm:p-[20px_20px_18px] flex flex-col gap-3.5">
              <div className="flex justify-between items-center">
                <h4 className="text-[13px] font-semibold">Structured extraction</h4>
                <span className="text-[11px] font-semibold text-[#d8c07a] bg-[#b8860b]/[0.12] border border-[#b8860b]/28 px-2 py-[3px] rounded-full">Needs review</span>
              </div>

              {[
                { label: "Document type", conf: "98%", val: "Bill of Lading" },
                { label: "BL number", conf: "97%", val: "BL-X26-00002" },
                { label: "Vessel", conf: "94%", val: "MV Harmattan" },
              ].map((f) => (
                <div key={f.label} className="bg-[#1b1d18] border border-[#2a2c26] rounded-[10px] px-3 py-[11px]">
                  <div className="flex justify-between text-[10.5px] text-[#8d9284] mb-1">
                    <span>{f.label}</span><span className="tabular-nums">{f.conf}</span>
                  </div>
                  <div className="text-sm font-medium tracking-tight">{f.val}</div>
                </div>
              ))}

              <div className="bg-[#c45c26]/[0.07] border border-[#c45c26]/45 rounded-[10px] px-3 py-[11px]">
                <div className="flex justify-between text-[10.5px] text-[#8d9284] mb-1">
                  <span>Commodity</span><span>corrected</span>
                </div>
                <div className="text-sm font-medium tracking-tight">Industrial fasteners</div>
                <div className="mt-1.5 text-[11px] text-[#e8a05a]">
                  You split &quot;STC mixed cartons&quot;. This split is now saved to the template.
                </div>
              </div>

              <div className="bg-[#1b1d18] border border-[#2a2c26] rounded-[10px] px-3 py-[11px]">
                <div className="flex justify-between text-[10.5px] text-[#8d9284] mb-1">
                  <span>Route to</span><span>rule</span>
                </div>
                <div className="text-sm font-medium tracking-tight">ERP &middot; inbound shipment 4091</div>
              </div>

              <div className="flex gap-2 mt-auto pt-1">
                <button type="button"
                  className="flex-1 h-[38px] rounded-[10px] bg-transparent text-[#d7dacd] border border-[#2a2c26] text-[13.5px] font-semibold hover:bg-[#1f211c] transition-colors">
                  Keep original
                </button>
                <button type="button"
                  className="flex-1 h-[38px] rounded-[10px] bg-[#c45c26] text-white text-[13.5px] font-semibold shadow-[0_8px_24px_rgba(196,92,38,.28)] hover:bg-[#d4682c] transition-colors">
                  Accept &amp; teach
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="w-[min(1120px,calc(100%-40px))] mx-auto pt-5 pb-20 sm:pb-24">
        <p className="text-xs tracking-[.16em] uppercase text-[#e8a05a] mb-2.5">Operations</p>
        <h2 className={`${instrumentSerif.className} text-[32px] sm:text-[46px] font-normal tracking-[-.02em] mb-3.5`}>Extract. Learn. Route.</h2>
        <p className="text-[#9aa08f] max-w-[52ch] mb-9">
          Three motions. No eight-card feature wall. The product is the loop between a page, a field, and the system of record.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {[
            {
              title: "AI extraction",
              desc: "Point it at a bill of lading, invoice or delivery order. Structured fields come back in seconds, ready for review.",
              icon: <path strokeLinecap="round" d="M4 7h16M4 12h10M4 17h7" />,
            },
            {
              title: "Templates that learn",
              desc: "Set up a template once for each document type. Corrections your team makes feed back into future extractions.",
              icon: <path strokeLinecap="round" d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" />,
            },
            {
              title: "Push to systems",
              desc: "Send extracted data to your ERP or any API endpoint. Documents emailed to your mailbox are read on arrival, with a full audit trail.",
              icon: <path strokeLinecap="round" d="M5 12h14M13 6l6 6-6 6" />,
            },
          ].map((f) => (
            <article key={f.title} className="bg-[#141512] border border-[#2a2c26] rounded-[14px] p-[22px]">
              <div className="w-9 h-9 rounded-[9px] grid place-items-center bg-[#e8a05a]/10 text-[#e8a05a] border border-[#e8a05a]/18">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  {f.icon}
                </svg>
              </div>
              <h3 className="text-base font-semibold mt-3 mb-2 tracking-tight">{f.title}</h3>
              <p className="text-[#9aa08f] text-sm leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="w-[min(1120px,calc(100%-40px))] mx-auto border-t border-[#2a2c26] py-[22px] sm:pb-9 flex flex-col sm:flex-row gap-1.5 sm:gap-0 justify-between text-[#7a7f72] text-[12.5px]">
        <span>&copy; 2026 AI PDF Studio</span>
        <span>Document processing for logistics teams</span>
      </footer>
    </div>
  );
}
