import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IntegrationSiteFooter, IntegrationSiteHeader } from "@/modules/landing/ui/integration-site-chrome";

export const metadata = {
  title: "Legal Documents | GetBackplate",
  description: "Terms of service and privacy policies for the GetBackplate QuickBooks® Online to Restaurant365 integration.",
};

const INTEGRATION = {
  kind: "Integration",
  accent: "#6d28d9",
  rowHoverClass: "hover:bg-[#f3effd] hover:border-[#6d28d9]/30",
  iconHoverClass: "group-hover:text-[#6d28d9]",
  title: "QuickBooks® Online → Restaurant365",
  description:
    "Automated middleware that delivers QuickBooks® Online invoices to Restaurant365 via FTP, with field mapping and audit logging. For vendors invoicing R365-based clients.",
  docs: [
    { label: "End-User License Agreement", description: "Terms of service for the Integration", href: "/legal/integration/terms" },
    { label: "Privacy Policy", description: "Data handling for QuickBooks® Online and R365", href: "/legal/integration/privacy" },
    { label: "Master Services Agreement", description: "Subscription terms, fees, and SLA", href: "/legal/integration/msa" },
    { label: "Incident Response", description: "How we detect, respond to, and communicate security incidents", href: "/legal/integration/incident-response" },
  ],
};

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8", fontFamily: "var(--font-plus-jakarta-sans), sans-serif" }}>
      <IntegrationSiteHeader />

      <main className="mx-auto max-w-[1000px] px-6 py-16 sm:px-10">
        <div className="text-center">
          <span
            className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-[0.08em]"
            style={{ background: "#fbe0cd", color: "#c04a17" }}
          >
            Legal
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#1a1a1a]">Legal Documents</h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-[#6b7280]">
            Terms of service, privacy, and operational policies for the QuickBooks® Online to Restaurant365 integration.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-[720px]">
          <div className="overflow-hidden rounded-2xl border border-[#e5e7f0] bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.06]">
            <div className="m-6 mb-0 h-[3px] w-12" style={{ background: INTEGRATION.accent }} />
            <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">{INTEGRATION.kind}</p>
              <h2 className="mt-1 text-xl font-bold text-[#1a1a1a]">{INTEGRATION.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{INTEGRATION.description}</p>

              <div className="mt-5 space-y-2">
                {INTEGRATION.docs.map((doc) => (
                  <Link
                    key={doc.href}
                    href={doc.href}
                    className={`group flex items-center justify-between rounded-xl border border-[#e5e7f0] bg-[#fafafb] px-4 py-3 transition-colors ${INTEGRATION.rowHoverClass}`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[#1a1a1a]">{doc.label}</span>
                      <span className="block text-xs text-[#9ca3af]">{doc.description}</span>
                    </span>
                    <ArrowRight className={`h-4 w-4 flex-shrink-0 text-[#9ca3af] transition-colors ${INTEGRATION.iconHoverClass}`} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-12 text-center text-[13px] italic text-[#9ca3af]">
          For legal inquiries, contact GetBackplate at 1001 S. 10th St., Suite G#784, McAllen, Texas 78501 — Phone +1 (956) 802-9639.
        </p>
        <p className="mt-3 text-center text-[11px] text-[#9ca3af]">
          Intuit and QuickBooks® Online are registered trademarks of Intuit Inc. Used with permission.
        </p>
      </main>
      <IntegrationSiteFooter />
    </div>
  );
}
