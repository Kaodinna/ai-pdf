"use client";

import { useEffect, useState } from "react";
import {
  getBilling, getBillingHistory, startCheckout, grantCredits, getUsers,
} from "@/lib/api";
import type { BillingInfo, CreditEntry, AuthUser } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function BillingPanel({ isAdmin }: { isAdmin: boolean }) {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [history, setHistory] = useState<CreditEntry[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [grantUser, setGrantUser] = useState("");
  const [grantCreditsValue, setGrantCreditsValue] = useState("1000");
  const [grantNote, setGrantNote] = useState("Manual top-up");

  const load = async () => {
    const [b, h] = await Promise.all([getBilling(), getBillingHistory()]);
    if (b.success && b.data) setInfo(b.data);
    if (h.success && h.data) setHistory(h.data);
  };

  useEffect(() => {
    load();
    window.addEventListener("credits-changed", load);
    if (isAdmin) getUsers().then((r) => { if (r.success && r.data) setUsers(r.data); });
    const params = new URLSearchParams(window.location.search);
    const status = params.get("billing");
    if (status === "success") setNotice("Payment received — credits are added as soon as the payment is confirmed (usually a few seconds).");
    if (status === "cancelled") setNotice("Checkout cancelled. No charge was made.");
    return () => window.removeEventListener("credits-changed", load);
  }, []);

  const buy = async (packageId: string) => {
    setBuying(packageId);
    setError(null);
    const res = await startCheckout(packageId);
    if (res.success && res.data) { window.location.href = res.data.url; return; }
    setError(res.error ?? "Could not start checkout");
    setBuying(null);
  };

  const grant = async () => {
    const amount = parseInt(grantCreditsValue, 10);
    if (!grantUser || !amount || amount <= 0) { setError("Choose a user and a positive credit amount"); return; }
    setError(null);
    const res = await grantCredits(grantUser, amount, grantNote.trim() || "Manual top-up");
    if (res.success) { setNotice(`Granted ${amount} credits.`); load(); }
    else setError(res.error ?? "Grant failed");
  };

  if (!info) return <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>;

  const pageUsd = (info.page_credits * info.usd_per_credit).toFixed(2);

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
          <p className="text-xs text-gray-500">Credits per page (${pageUsd})</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">${info.usd_per_credit}</p>
          <p className="text-xs text-gray-500">Value of one credit</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Buy credits</h3>
        <div className="grid grid-cols-3 gap-3">
          {info.packages.map((p) => (
            <div key={p.id} className="rounded-xl border bg-white p-4 flex flex-col">
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">${p.usd}</p>
              <p className="text-xs text-gray-500">{p.credits.toLocaleString()} credits · about {Math.floor(p.credits / info.page_credits)} pages</p>
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
