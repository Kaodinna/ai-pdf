import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — AI PDF Studio",
  description: "How AI PDF Studio collects, uses, and protects your data.",
};

const sans: React.CSSProperties = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="text-[19px] font-semibold text-[#faf8f3] mb-3 tracking-tight">{title}</h2>
      <div className="text-[14.5px] leading-[1.75] text-[#b7bbaf] space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0c0d0b] text-[#faf8f3] antialiased" style={sans}>
      <header className="sticky top-0 z-20 backdrop-blur-2xl bg-[#0c0d0b]/72 border-b border-white/[0.06]">
        <div className="w-[min(760px,calc(100%-40px))] mx-auto flex items-center justify-between h-[68px]">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-[#e8a05a] to-[#c45c26] grid place-items-center ring-1 ring-inset ring-white/10 flex-shrink-0">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="#1a1c16" strokeWidth={2}>
                <path d="M7 3.5h7l4 4V20.5H7z" />
                <path d="M14 3.5V8h4.5" />
                <path d="M9.5 13h5M9.5 16.5h3.5" />
              </svg>
            </div>
            <strong className="text-sm font-semibold tracking-tight text-[#faf8f3]">AI PDF Studio</strong>
          </Link>
          <Link href="/" className="text-[13px] text-[#c9ccbf] hover:text-white transition-colors">← Back</Link>
        </div>
      </header>

      <main className="w-[min(760px,calc(100%-40px))] mx-auto py-14 sm:py-16">
        <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-[-.02em] mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-[#7d8276] mb-10">Last updated: October 21, 2026</p>

        <Section title="Who we are">
          <p>
            AI PDF Studio is operated by Empatech (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We build software that
            extracts structured data from shipping and trade documents — bills of lading, invoices, cover
            pages, and similar paperwork — for logistics teams. This policy explains what data we collect
            through the app, why, and what you can do about it.
          </p>
          <p>
            Questions about this policy or your data: <a href="mailto:empatechpower@gmail.com" className="text-[#e8a05a] hover:underline">empatechpower@gmail.com</a>.
          </p>
        </Section>

        <Section title="What we collect">
          <p>We collect the following, scoped to the company workspace you belong to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#d8dbcf]">Account information</strong> — name, email address, and a hashed password (we never store your password in plain text).</li>
            <li><strong className="text-[#d8dbcf]">Documents you upload</strong> — the PDFs themselves, and the data extracted from them (field values, tables, confidence scores, your corrections).</li>
            <li><strong className="text-[#d8dbcf]">Email content</strong>, only if you connect a mailbox to Smart Inbox — the sender, subject, and attachments of mail sent to that address.</li>
            <li><strong className="text-[#d8dbcf]">Usage and audit logs</strong> — actions taken in the app (uploads, approvals, template edits), kept for traceability and security.</li>
            <li><strong className="text-[#d8dbcf]">Billing records</strong> — your credit balance, purchase history, and payment confirmations from our payment processor (we do not see or store your card details).</li>
            <li><strong className="text-[#d8dbcf]">Support communications</strong> — anything you send us directly.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To run the extraction, detection, and rule features the app provides.</li>
            <li>To let the system learn from corrections you make — these are stored only within your own company's workspace and never used to improve another company's extractions.</li>
            <li>To process payments and maintain your credit balance.</li>
            <li>To secure the service: detecting abuse, enforcing access controls, and keeping an audit trail.</li>
            <li>To respond to support requests.</li>
          </ul>
          <p>We do not sell your data, and we do not use it for advertising. We have no third-party analytics or ad-tracking scripts on this site.</p>
        </Section>

        <Section title="Who else processes your data">
          <p>
            Running the product means sending documents to a small number of specialist providers to do the
            actual extraction and AI work. We've chosen providers that process data for us under their own
            business terms, not to train models on your documents for other customers:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-[#d8dbcf]">Reducto</strong> — performs the core document extraction (reading fields, tables, and page content from your PDFs).</li>
            <li><strong className="text-[#d8dbcf]">Anthropic (Claude)</strong> — used for document-type detection, page matching, grouping multi-document files, and generating extraction rules.</li>
            <li><strong className="text-[#d8dbcf]">Paystack</strong> — handles payment processing when you buy credits. We never see your card number.</li>
            <li>Our infrastructure provider, who hosts the servers the app runs on.</li>
          </ul>
          <p>Because some of these providers are based outside Nigeria, your data may be processed on servers in other countries, including the United States.</p>
        </Section>

        <Section title="Company separation">
          <p>
            AI PDF Studio is a shared platform used by multiple companies. Every record — documents, templates,
            corrections, users — is tied to one company, and the system enforces that a user can only see their
            own company's data. Platform administrators can access data across companies strictly for operating
            and supporting the service.
          </p>
        </Section>

        <Section title="How long we keep data">
          <p>
            We keep your documents and extracted data for as long as your account is active. If you close your
            account or ask us to delete your data, we will remove it within 30 days, except where we're required
            to keep records for legal, billing, or fraud-prevention purposes. Audit logs are kept longer for
            security traceability, but are scoped to your company and not shared outside it.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is transmitted over encrypted connections (HTTPS). Passwords are hashed, never stored in plain
            text. Access to each company's workspace is restricted by login and role (admin vs. member), and
            sensitive areas of the app are limited to admins. No system is perfectly secure, and we keep
            improving this as the product grows.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask us to access, correct, export, or delete the personal data we hold about you by emailing{" "}
            <a href="mailto:empatechpower@gmail.com" className="text-[#e8a05a] hover:underline">empatechpower@gmail.com</a>.
            If your company has an administrator, some of these requests (like exporting your company's documents)
            may be handled through them, since the data belongs to your company's workspace.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use a single essential cookie to keep you signed in. We don't use advertising or cross-site
            tracking cookies.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>AI PDF Studio is a business tool and isn't directed at children. We don't knowingly collect data from anyone under 18.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes to this policy, we'll update the date at the top of this page and, where
            appropriate, let account administrators know.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Empatech — <a href="mailto:empatechpower@gmail.com" className="text-[#e8a05a] hover:underline">empatechpower@gmail.com</a>
          </p>
        </Section>
      </main>
    </div>
  );
}
