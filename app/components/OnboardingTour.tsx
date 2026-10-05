"use client";

import { useEffect, useLayoutEffect, useState } from "react";

export type TourStep = { target: string; title: string; body: string; adminOnly?: boolean };

export const TOUR_STEPS: TourStep[] = [
  {
    target: "nav-files",
    title: "Start with Files",
    body: "Upload a PDF in the header and it's read automatically. Each file shows its extracted fields, and clicking a field highlights where it came from.",
  },
  {
    target: "nav-templates",
    title: "Templates tell it what to look for",
    body: "A template lists the fields for one document type, such as a Bill of Lading. Create one from a file, or write it by hand.",
  },
  {
    target: "nav-inbox",
    title: "Mail arrives here",
    body: "Documents sent to a connected mailbox land in Smart Inbox. If the mailbox has a template, they're already extracted when they arrive.",
  },
  {
    target: "nav-ai",
    title: "AI Commands, Split and Merge",
    body: "Plain-language commands for a document, plus tools to split or combine PDFs. Hover any sidebar item for a short description.",
  },
  {
    target: "credits",
    title: "Credits",
    body: "Each extracted page uses credits. Your balance is always shown here, and you can buy more under Billing.",
  },
  {
    target: "reextract",
    title: "Re-extract",
    body: "Open a file and choose Re-extract to read it again, against a different template. This uses credits, the same as the first read.",
  },
  {
    target: "decision",
    title: "Approve or reject",
    body: "Record your decision on a file here. Approved fields count as correct, which is how the team measures accuracy.",
  },
  {
    target: "user-menu",
    title: "Need this again?",
    body: "Open your name in the top-right to replay this tour at any time.",
  },
  {
    target: "nav-billing",
    title: "Admin: manage users and credits",
    body: "Open your name in the top-right to manage user accounts. In Billing, admins can grant credits to any user.",
    adminOnly: true,
  },
];

const storageKey = (userId: string) => `onboarding_tour_done_${userId}`;

export function markTourDone(userId: string) {
  try { localStorage.setItem(storageKey(userId), "1"); } catch { /* storage blocked: tour may show again, which is harmless */ }
}

export function tourDone(userId: string): boolean {
  try { return localStorage.getItem(storageKey(userId)) === "1"; } catch { return false; }
}

export function restartTour() {
  window.dispatchEvent(new Event("tour:restart"));
}

export default function OnboardingTour({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = TOUR_STEPS.filter((s) => isAdmin || !s.adminOnly);

  useEffect(() => {
    if (!tourDone(userId)) setActive(true);
    const onRestart = () => { setIndex(0); setActive(true); };
    window.addEventListener("tour:restart", onRestart);
    return () => window.removeEventListener("tour:restart", onRestart);
  }, [userId]);

  // Skip steps whose anchor isn't on screen (e.g. a control hidden on this tab).
  const step = steps[index];
  useLayoutEffect(() => {
    if (!active || !step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) { setRect(null); return; }
      setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  const finish = () => { markTourDone(userId); setActive(false); };
  const next = () => {
    if (index >= steps.length - 1) finish();
    else setIndex((i) => i + 1);
  };

  if (!active || !step) return null;

  // Anchor missing: show the step centred so the tour still reads cleanly.
  const pos = rect
    ? { top: Math.min(rect.top, window.innerHeight - 220), left: Math.min(rect.right + 12, window.innerWidth - 300) }
    : { top: window.innerHeight / 2 - 90, left: window.innerWidth / 2 - 140 };

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" role="dialog" aria-label="Getting started">
      {rect && (
        <div className="absolute rounded-xl ring-4 ring-blue-400/60 pointer-events-none"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />
      )}
      <div className="absolute w-[280px] bg-white rounded-xl shadow-2xl border border-blue-100 p-4 pointer-events-auto"
        style={{ top: pos.top, left: pos.left }}>
        <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
          Step {index + 1} of {steps.length}
        </p>
        <h3 className="text-sm font-semibold text-gray-900 mt-1">{step.title}</h3>
        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600">Skip tour</button>
          <button onClick={next}
            className="text-xs bg-blue-700 text-white px-3.5 py-1.5 rounded-lg font-medium hover:bg-blue-800">
            {index >= steps.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
