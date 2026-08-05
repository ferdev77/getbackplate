import type { Metadata } from "next";
import { IntegrationSiteHeader } from "@/modules/landing/ui/integration-site-chrome";
import Link from "next/link";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";
import { getAuthenticatedSupportIdentity } from "@/modules/support/authenticated-support-identity";
import { isSafeRedirectPath } from "@/shared/lib/safe-redirect-path";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: "Support and Privacy Requests | GetBackplate",
  description: "Contact GetBackplate support or submit a data access, export, correction, or deletion request.",
};

type SupportPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const returnTo = isSafeRedirectPath(params.returnTo) ? params.returnTo : null;
  const identityResolution = await getAuthenticatedSupportIdentity().catch(() => ({ kind: "unresolved" as const }));
  return (
    // Fondo blanco y acento igual que los documentos legales, con el header del
    // sitio en lugar del logo suelto. Sin footer, por pedido del owner.
    <>
      <IntegrationSiteHeader />
      <main className="min-h-screen bg-white px-5 py-12 text-slate-950 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c04a17]">Support and privacy</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">Tell us what you need, with a request you can track.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">Use this form for product support or to request access, correction, export, or deletion of data. You can also email <a className="font-semibold text-[#c04a17]" href="mailto:support@getbackplate.com">support@getbackplate.com</a>.</p>
        <div className="mt-10">
          <SupportForm
            identity={identityResolution.kind === "resolved" ? identityResolution.identity : null}
            identityBlocked={identityResolution.kind === "unresolved" || identityResolution.kind === "error"}
            returnTo={returnTo}
          />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500"><Link href="/legal/integration/privacy" className="underline">Integration Privacy Policy</Link> · <Link href="/trust" className="underline">Trust Center</Link></p>
        <p className="mt-3 text-center text-xs text-slate-500">Backplate Technologies LLC, d/b/a GetBackplate · {COMPANY_ADDRESS.inline}</p>
      </div>
      </main>
    </>
  );
}
