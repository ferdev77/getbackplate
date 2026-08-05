import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { normalizeRecoveryTokenHash } from "@/shared/lib/recovery-link";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { TenantAuthBrand } from "@/shared/ui/tenant-auth-brand";

type RecoveryLinkPageProps = {
  searchParams: Promise<{ t?: string; org?: string; error?: string }>;
};

export async function generateMetadata({ searchParams }: RecoveryLinkPageProps): Promise<Metadata> {
  const params = await searchParams;
  const organizationHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationHint, requestHost);

  if (!tenantBranding) {
    return {
      title: "Confirm password recovery | GetBackplate",
    };
  }

  return {
    title: `Confirm password recovery | ${tenantBranding.companyName}`,
    icons: tenantBranding.faviconUrl
      ? {
          icon: [{ url: tenantBranding.faviconUrl }],
        }
      : undefined,
  };
}

export default async function RecoveryLinkPage({ searchParams }: RecoveryLinkPageProps) {
  const params = await searchParams;
  const tokenHash = normalizeRecoveryTokenHash(params.t);
  const organizationHint = String(params.org ?? "").trim();
  const error = String(params.error ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationHint, requestHost);
  const effectiveOrganizationHint = organizationHint || tenantBranding?.organizationHint || "";
  const forgotPasswordHref = effectiveOrganizationHint
    ? `/auth/forgot-password?org=${encodeURIComponent(effectiveOrganizationHint)}`
    : "/auth/forgot-password";

  if (!tokenHash) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
        <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <TenantAuthBrand branding={tenantBranding} caption="Company account recovery" />
          <h1 className="mb-2 text-2xl font-bold tracking-tight">Invalid link</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            This password recovery link is invalid. Request a new one to continue.
          </p>
          <Link
            href={forgotPasswordHref}
            className="inline-flex rounded-[var(--gbp-radius-lg)] bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-[var(--gbp-on-accent)] hover:bg-[var(--gbp-accent-hover)]"
          >
            Request a new link
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
        <TenantAuthBrand branding={tenantBranding} caption="Company account recovery" />

        <h1 className="mb-2 text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="mb-6 text-sm text-[var(--gbp-text2)]">
          To protect your account, confirm manually and we will take you to change your password.
        </p>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form action="/auth/recovery-link/continue" method="post">
          <input type="hidden" name="t" value={tokenHash} />
          <input type="hidden" name="org" value={effectiveOrganizationHint} />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--gbp-shadow-accent)] transition hover:bg-[var(--gbp-accent-hover)]"
          >
            Continue securely
          </button>
        </form>

        <p className="mt-4 text-xs text-[var(--gbp-text2)]">
          If this link does not work, request a new one from the password recovery page.
        </p>
      </section>
    </main>
  );
}
