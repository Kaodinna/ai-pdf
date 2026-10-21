"use client";

import { useEffect, useState } from "react";
import {
  getBilling, getBillingHistory, startCheckout, grantCredits, getUsers,
} from "@/lib/api";
import type { BillingInfo, CreditEntry, AuthUser } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A rough, zero-network default: map the browser's IANA timezone to the
// currency for that country, for the handful of countries Paystack can
// settle in. Anyone else defaults to USD. It's only a starting guess —
// the dropdown lets the customer override it, and billing_checkout falls
// back to NGN itself if a currency turns out not to be enabled.
const TZ_CURRENCY: Record<string, string> = {
  "Africa/Lagos": "NGN",
  "Africa/Accra": "GHS",
  "Africa/Johannesburg": "ZAR",
  "Africa/Nairobi": "KES",
};

function detectDefaultCurrency(): string {
  try {
    const saved = localStorage.getItem("billing_currency");
    if (saved) return saved;
  } catch { /* private window / blocked storage — fall through */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ_CURRENCY[tz] || "USD";
  } catch {
    return "USD";
  }
}

const CURRENCY_OPTIONS = [
  { code: "NGN", label: "₦ NGN — Nigeria" },
  { code: "USD", label: "$ USD — International" },
  { code: "GHS", label: "GH₵ GHS — Ghana" },
  { code: "ZAR", label: "R ZAR — South Africa" },
  { code: "KES", label: "KSh KES — Kenya" },
];

export default function BillingPanel({ isAdmin }: { isAdmin: boolean }) {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [history, setHistory] = useState<CreditEntry[]>([]);
  const [currency, setCurrency] = useState(detectDefaultCurrency);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantCreditsValue, setGrantCreditsValue] = useState("1000");
  const [grantNote, setGrantNote] = useState("Manual top-up");

  const loadBilling = async (cur: string) => {
    const b = await getBilling(cur);
    if (b.success && b.data) setInfo(b.data);
  };

  useEffect(() => {
    loadBilling(currency);
    getBillingHistory().then((h) => { if (h.success && h.data) setHistory(h.data); });
    const onCreditsChanged = () => loadBilling(currency);
    window.addEventListener("credits-changed", onCreditsChanged);
    if (isAdmin) getUsers().then((r) => { if (r.success && r.data) setUsers(r.data); });
    const params = new URLSearchParams(window.location.search);
    const status = params.get("billing");
    if (status === "success") setNotice("Payment received — credits are added as soon as the payment is confirmed (usually a few seconds).");
    if (status === "cancelled") setNotice("Checkout cancelled. No charge was made.");
    return () => window.removeEventListener("credits-changed", onCreditsChanged);
  }, [currency]);

  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    try { localStorage.setItem("billing_currency", cur); } catch { /* ignore */ }
  };

  const buy = async (packageId: string) => {
    setBuying(packageId);
    setError(null);
    const res = await startCheckout(packageId, currency);
    if (res.success && res.data) {
      if (res.data.downgraded_to_ngn) {
        setNotice("Your currency isn't enabled on our payment account yet — charging in Nigerian Naira instead.");
        setTimeout(() => { window.location.href = res.data!.url; }, 1800);
        return;
      }
      window.location.href = res.data.url;
      return;
    }
    setError(res.error ?? "Could not start checkout");
    setBuying(null);
  };

  const grant = async () => {
    const amount = parseInt(grantCreditsValue, 10);
    if (!grantUser || !amount || amount <= 0) { setError("Choose a user and a positive credit amount"); return; }
    setError(null);
    const res = await grantCredits(grantUser, amount, grantNote.trim() || "Manual top-up");
    if (res.success) { setNotice(`Granted ${amount} credits.`); loadBilling(currency); }
    else setError(res.error ?? "Grant failed");
  };

  if (!info) return <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>;

  const sym = info.currencies[info.currency]?.symbol ?? "";
  const pageCost = (info.page_credits * info.credit_price).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-2xl font-bold text-blue-900">{info.balance.toLocaleString()}</p>
          <p className="text-xs text-blue-700">Credits available</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">{info.page_credits}</p>
          <p className="text-xs text-gray-500">Credits per page ({sym}{pageCost})</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">{sym}{info.credit_price}</p>
          <p className="text-xs text-gray-500">Value of one credit</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Buy credits</h3>
          <select value={currency} onChange={(e) => changeCurrency(e.target.value)}
            className="border rounded-lg px-2 py-1 text-xs bg-white text-gray-600">
            {CURRENCY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {info.packages.map((p) => (
            <div key={p.id} className="rounded-xl border bg-white p-4 flex flex-col">
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{sym}{p.price.toLocaleString()}</p>
              {p.currency !== "USD" && <p className="text-[11px] text-gray-400">≈ ${p.usd}</p>}
              <p className="text-xs text-gray-500 mt-1">{p.credits.toLocaleString()} credits · about {Math.floor(p.credits / info.page_credits)} pages</p>
              <button onClick={() => buy(p.id)} disabled={!info.payments_enabled || buying !== null}
                className="mt-4 text-sm bg-blue-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800 disabled:opacity-50">
                {buying === p.id ? "Redirecting…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
        {!info.payments_enabled && (
          <p className="text-xs text-gray-500 mt-2">Online payments are not switched on yet. Contact us to add credits.</p>
        )}
        {info.currency !== "USD" && (
          <p className="text-[11px] text-gray-400 mt-2">
            Converted from USD at the live rate, as of {new Date(info.fx_as_of).toLocaleString()}
            {info.fx_stale && <span className="text-amber-600"> — rate provider unreachable, showing the last known rate</span>}.
            If this currency isn&apos;t enabled on our payment account, checkout automatically charges in Naira instead.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b bg-gray-50">
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-3 py-2 font-medium">What</th>
                <th className="text-right px-3 py-2 font-medium">Credits</th>
                <th className="text-right px-4 py-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No activity yet.</td></tr>
              ) : history.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(e.created_at)}</td>
                  <td className="px-3 py-2 text-gray-700">{e.reason}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${e.delta < 0 ? "text-gray-700" : "text-green-700"}`}>
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{e.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Grant credits (admin)</h3>
          <div className="grid grid-cols-4 gap-3">
            <select value={grantUser} onChange={(e) => setGrantUser(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-sm bg-white">
              <option value="">Choose a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
            <input value={grantCreditsValue} onChange={(e) => setGrantCreditsValue(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-sm" placeholder="Credits" />
            <input value={grantNote} onChange={(e) => setGrantNote(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 text-sm" placeholder="Note (shown in history)" />
            <button onClick={grant} className="text-sm bg-gray-800 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-gray-900">Grant</button>
          </div>
        </div>
      )}
    </div>
  );
}
