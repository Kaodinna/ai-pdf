import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — AI PDF Studio",
  description: "The terms that govern using AI PDF Studio.",
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

export default function TermsOfService() {
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
        <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-[-.02em] mb-2">Terms of Service</h1>
        <p className="text-[13px] text-[#7d8276] mb-10">Last updated: October 21, 2026</p>

        <Section title="Agreement">
          <p>
            These terms govern your use of AI PDF Studio, operated by Empatech (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
            By creating an account or using the service, you agree to them. If you're using AI PDF Studio on
            behalf of a company, you're confirming you have the authority to agree to these terms for that company.
          </p>
        </Section>

        <Section title="The service">
          <p>
            AI PDF Studio lets you upload shipping and trade documents, extract structured data from them using
            templates and AI, review and correct the results, and route them through workflows, rules, and
            integrations. Accounts are created by an administrator for your company — there's currently no
            public self-signup.
          </p>
        </Section>

        <Section title="Your account">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You're responsible for keeping your login credentials confidential and for activity under your account.</li>
            <li>Each account belongs to one company workspace. You may only access data belonging to your own company, unless you're a platform administrator.</li>
            <li>Tell us promptly if you suspect unauthorized access to your account.</li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Upload content you don't have the right to process, or content that's illegal, infringing, or harmful.</li>
            <li>Attempt to access another company's data or bypass access controls.</li>
            <li>Attempt to abuse free trial credits — for example, creating multiple accounts to repeatedly claim trials.</li>
            <li>Reverse-engineer, scrape, or resell the service without our written permission.</li>
            <li>Interfere with the service's operation, including through excessive automated requests.</li>
          </ul>
          <p>We may suspend or terminate accounts that violate these terms.</p>
        </Section>

        <Section title="Your content">
          <p>
            You retain all rights to the documents you upload and the data extracted from them. By uploading
            content, you grant us a limited license to process, store, and display it solely to provide the
            service to you. We don't claim ownership of your documents, and we don't use your documents to
            train models for other customers.
          </p>
        </Section>

        <Section title="Credits and billing">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>The service runs on prepaid credits. Certain actions (document extraction, AI-assisted features) consume credits from your company's balance.</li>
            <li>New accounts may receive a limited number of free trial credits. We can change or discontinue the trial at any time.</li>
            <li>Credit purchases are processed by Paystack. Prices and packages may change; we'll show the current price before you pay.</li>
            <li>Purchased credits are generally non-refundable, except where required by law or at our discretion.</li>
            <li>We may change how much a given action costs in credits as our own costs change, with notice to administrators.</li>
          </ul>
        </Section>

        <Section title="Service availability">
          <p>
            We aim to keep the service available and reliable, but we don't guarantee uninterrupted access.
            Features may change, and we may add, modify, or remove them as the product develops. We'll try to
            give notice of changes that materially affect how you use the service.
          </p>
        </Section>

        <Section title="Disclaimer and limitation of liability">
          <p>
            The service is provided &ldquo;as is&rdquo;, without warranties of any kind, express or implied.
            Extraction results, including AI-generated ones, may contain errors — you're responsible for
            reviewing and approving data before relying on it for business decisions. To the maximum extent
            permitted by law, we aren't liable for indirect, incidental, or consequential damages, and our
            total liability for any claim is limited to the amount you paid us in the three months before the
            claim arose.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You can stop using the service at any time. We may suspend or terminate your access if you violate
            these terms, or discontinue the service with reasonable notice. On termination, your right to use
            the service ends; our data retention and deletion practices are described in our{" "}
            <Link href="/privacy" className="text-[#e8a05a] hover:underline">Privacy Policy</Link>.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms as the product changes. If we make material changes, we'll update the
            date at the top of this page and let account administrators know.
          </p>
        </Section>

        <Section title="Governing law">
          <p>These terms are governed by the laws of Nigeria, without regard to conflict-of-law principles.</p>
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
