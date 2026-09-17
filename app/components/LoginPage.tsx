"use client";

import { useState } from "react";
import { Instrument_Serif } from "next/font/google";
import { login } from "@/lib/api";
import type { AuthUser } from "@/lib/api";

// Same font setup as LandingPage.tsx — Geist Sans/Mono are already loaded
// app-wide in app/layout.tsx as CSS vars, applied locally here rather than
// touching the global (Arial) body font the rest of the app relies on.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const sans: React.CSSProperties = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" };
const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" };

export default function LoginPage({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error ?? "Login failed");
      return;
    }
    onLoggedIn(res.data);
  };

  const logoMark = (
    <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-[#e8a05a] to-[#c45c26] grid place-items-center flex-shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1c16" strokeWidth={2}>
        <path d="M7 3.5h7l4 4V20.5H7z" />
        <path d="M14 3.5V8h4.5" />
        <path d="M9.5 13h5M9.5 16.5h3.5" />
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] bg-[#0c0d0b]" style={sans}>
      {/* Brand pane */}
      <section className="relative overflow-hidden flex flex-col px-6 sm:px-10 pt-8 pb-7 lg:pb-9 text-[#faf8f3]"
        style={{ background: "radial-gradient(900px 500px at 10% -10%, rgba(196,92,38,.18), transparent 55%), #0c0d0b" }}>
        <div className="flex items-center gap-3">
          {logoMark}
          <div className="leading-[1.15]">
            <strong className="text-sm font-semibold">AI PDF Studio</strong>
            <p className="text-[11px] text-[#9aa08f]">Document intelligence</p>
          </div>
        </div>

        <div className="mt-10 lg:mt-14 max-w-md">
          <h1 className={`${instrumentSerif.className} text-[36px] sm:text-[44px] lg:text-[52px] font-normal tracking-[-.03em] leading-[1.02]`}>
            The workspace already knows the last correction{" "}
            <span className={`${instrumentSerif.className} italic text-[#e8a05a]`}>you made.</span>
          </h1>
          <p className="mt-3.5 text-[#b3b7aa] text-[15px] max-w-[36ch]">
            Sign in to extract, review, and route shipping documents. Templates learn as the team works.
          </p>
        </div>

        {/* Decorative product preview — hidden below lg, same as the landing page's stage */}
        <div className="hidden lg:block mt-auto bg-[#141512] border border-[#2a2c26] rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.4)]">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#2a2c26] text-[11px] text-[#8b907f]" style={mono}>
            <div className="flex gap-[5px] flex-shrink-0">
              <i className="w-[7px] h-[7px] rounded-full bg-[#3a3c34] block" />
              <i className="w-[7px] h-[7px] rounded-full bg-[#3a3c34] block" />
              <i className="w-[7px] h-[7px] rounded-full bg-[#3a3c34] block" />
            </div>
            <span className="truncate">Outward_Cover_SHA001.pdf &middot; template: Bill of Lading</span>
          </div>
          <div className="grid grid-cols-[1.1fr_.9fr] min-h-[250px]">
            <article className="m-3.5 bg-[#f4efe4] text-[#1a1c16] rounded-[7px] px-5 py-[18px] text-[11px]">
              <div className="text-[9px] tracking-[.14em] uppercase text-[#7a7364] flex justify-between">
                <span>Ocean Bill of Lading</span><span>BL-X26-00002</span>
              </div>
              <h3 className={`${instrumentSerif.className} text-xl font-normal mt-2.5 mb-1`}>Actual Shipping Line</h3>
              <p className="text-[#6b6558] mb-3">Shanghai &rarr; Lagos</p>
              <p>
                <span className="bg-[#f3d2b0] shadow-[0_0_0_3px_#f3d2b0]">STC: industrial fasteners</span>
                , mixed cartons &middot; 240 pkgs
              </p>
            </article>
            <div className="p-3.5 flex flex-col gap-2">
              <div className="bg-[#1b1d18] border border-[#2a2c26] rounded-lg px-2.5 py-2">
                <div className="flex justify-between text-[10px] text-[#8d9284]"><span>Document type</span><span>98%</span></div>
                <div className="text-[13px] font-medium mt-0.5">Bill of Lading</div>
              </div>
              <div className="bg-[#c45c26]/[0.08] border border-[#c45c26]/45 rounded-lg px-2.5 py-2">
                <div className="flex justify-between text-[10px] text-[#8d9284]"><span>Commodity</span><span>corrected</span></div>
                <div className="text-[13px] font-medium mt-0.5">Industrial fasteners</div>
              </div>
              <div className="bg-[#1b1d18] border border-[#2a2c26] rounded-lg px-2.5 py-2">
                <div className="flex justify-between text-[10px] text-[#8d9284]"><span>Route to</span><span>rule</span></div>
                <div className="text-[13px] font-medium mt-0.5">ERP &middot; inbound 4091</div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-[#7a7f72]">Internal workspace &middot; access is admin-managed</p>
      </section>

      {/* Form pane */}
      <section className="bg-[#f4efe4] text-[#1a1c16] grid place-items-center px-6 sm:px-7 py-10 lg:py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-[380px]">
          <h2 className={`${instrumentSerif.className} text-[34px] font-normal tracking-[-.03em]`}>Sign in to the workspace</h2>
          <p className="mt-2 mb-7 text-[#6b6558] text-[14.5px]">Use the account your admin created for you.</p>

          <div className="mb-4">
            <label className="block text-[12.5px] font-semibold mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
              autoComplete="username"
              placeholder="you@company.com"
              className="w-full h-[46px] px-3.5 rounded-[10px] border border-[#d7cfbe] bg-[#faf7f0] text-[#1a1c16] text-[14.5px] outline-none transition-all focus:border-[#c45c26] focus:bg-white focus:shadow-[0_0_0_4px_rgba(196,92,38,.14)]" />
          </div>

          <div className="mb-4">
            <label className="block text-[12.5px] font-semibold mb-1.5">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full h-[46px] pl-3.5 pr-14 rounded-[10px] border border-[#d7cfbe] bg-[#faf7f0] text-[#1a1c16] text-[14.5px] outline-none transition-all focus:border-[#c45c26] focus:bg-white focus:shadow-[0_0_0_4px_rgba(196,92,38,.14)]" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7a7364] hover:text-[#1a1c16] text-xs font-semibold px-1.5 py-1.5 transition-colors">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-xs text-[#8a4a22] bg-[#c45c26]/10 border border-[#c45c26]/25 rounded-[10px] px-3.5 py-2.5 mb-4">
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </p>
          )}

          <button type="submit" disabled={loading || !email.trim() || !password}
            className="w-full h-[46px] rounded-[10px] bg-[#c45c26] text-white text-[14.5px] font-semibold shadow-[0_10px_24px_rgba(196,92,38,.22)] hover:bg-[#d4682c] disabled:opacity-50 disabled:shadow-none transition-colors">
            {loading ? "Signing in…" : "Continue"}
          </button>

          <p className="mt-4 text-center text-[12.5px] text-[#7a7364]">
            No account yet? Ask an admin to create one.
          </p>
        </form>
      </section>
    </div>
  );
}
