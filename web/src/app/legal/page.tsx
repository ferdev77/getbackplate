import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Legal Documents | GetBackplate",
  description: "Terms of service and privacy policies for all GetBackplate products.",
};

const PRODUCTS = [
  {
    kind: "Product",
    accent: "#c04a17",
    rowHoverClass: "hover:bg-[#fef3ee] hover:border-[#c04a17]/30",
    iconHoverClass: "group-hover:text-[#c04a17]",
    title: "Operations Platform",
    description:
      "The full restaurant operations management platform — employee management, checklists, kitchen systems, document storage, scheduling, communication, and AI-powered insights.",
    docs: [
      { label: "End-User License Agreement", description: "Terms of service for the Platform", href: "/legal/platform/terms" },
      { label: "Privacy Policy", description: "How we handle your data", href: "/legal/platform/privacy" },
    ],
  },
  {
    kind: "Integration",
    accent: "#6d28d9",
    rowHoverClass: "hover:bg-[#f3effd] hover:border-[#6d28d9]/30",
    iconHoverClass: "group-hover:text-[#6d28d9]",
    title: "QuickBooks Online → Restaurant365",
    description:
      "Automated middleware that delivers QuickBooks Online invoices to Restaurant365 via FTP, with field mapping and audit logging. For vendors invoicing R365-based clients.",
    docs: [
      { label: "End-User License Agreement", description: "Terms of service for the Integration", href: "/legal/integration/terms" },
      { label: "Privacy Policy", description: "Data handling for QBO and R365", href: "/legal/integration/privacy" },
      { label: "Master Services Agreement", description: "Subscription terms, fees, and SLA", href: "/legal/integration/msa" },
    ],
  },
];

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen" style={{ background: "#f5f6f8", fontFamily: "var(--font-plus-jakarta-sans), sans-serif" }}>
      <header className="border-b border-[#e5e7f0] bg-white px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between">
          <Link href="/" className="inline-flex items-center" aria-label="GetBackplate home">
            <Image src="/getbackplate-logo-light.svg" alt="GetBackplate" width={150} height={22} className="h-[22px] w-auto" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: "#c04a17" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to GetBackplate
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 py-16 sm:px-10">
        <div className="text-center">
          <span
            className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-[0.08em]"
            style={{ background: "#fef3ee", color: "#c04a17" }}
          >
            Legal
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#1a1a1a]">Legal Documents</h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-[#6b7280]">
            Terms of service and privacy policies for all GetBackplate products. Select the service to view its specific documentation.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {PRODUCTS.map((product) => (
            <div
              key={product.title}
              className="overflow-hidden rounded-2xl border border-[#e5e7f0] bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.06]"
            >
              <div className="h-[3px] w-12 m-6 mb-0" style={{ background: product.accent }} />
              <div className="px-6 pb-6 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">{product.kind}</p>
                <h2 className="mt-1 text-xl font-bold text-[#1a1a1a]">{product.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{product.description}</p>

                <div className="mt-5 space-y-2">
                  {product.docs.map((doc) => (
                    <Link
                      key={doc.href}
                      href={doc.href}
                      className={`group flex items-center justify-between rounded-xl border border-[#e5e7f0] bg-[#fafafb] px-4 py-3 transition-colors ${product.rowHoverClass}`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-[#1a1a1a]">{doc.label}</span>
                        <span className="block text-xs text-[#9ca3af]">{doc.description}</span>
                      </span>
                      <ArrowRight className={`h-4 w-4 flex-shrink-0 text-[#9ca3af] transition-colors ${product.iconHoverClass}`} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-[13px] italic text-[#9ca3af]">
          For legal inquiries, contact GetBackplate at 1321 Upland Dr., Suite 9894, Houston, Texas 77043 — Phone +1 (956) 802-9639.
        </p>
      </main>
    </div>
  );
}
