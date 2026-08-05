import type { Metadata } from "next";
import { headers } from "next/headers";

import { updatePasswordAction } from "@/modules/auth/actions";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { TenantAuthBrand } from "@/shared/ui/tenant-auth-brand";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { PasswordInput } from "@/shared/ui/password-input";
import { TagPill } from "@/shared/ui/tag-pill";

type ChangePasswordPageProps = {
  searchParams: Promise<{ error?: string; reason?: string; next?: string; org?: string }>;
};

export async function generateMetadata({ searchParams }: ChangePasswordPageProps): Promise<Metadata> {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  if (!tenantBranding) {
    return {
      title: "Change password | GetBackplate",
    };
  }

  return {
    title: `Change password | ${tenantBranding.companyName}`,
    icons: tenantBranding.faviconUrl
      ? {
          icon: [{ url: tenantBranding.faviconUrl }],
        }
      : undefined,
  };
}

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const params = await searchParams;
  const reason = params.reason;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "";
  let organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!organizationIdHint) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const admin = createSupabaseAdminClient();
      const { data: memberships } = await admin
        .from("memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(2);

      if (memberships?.length === 1 && memberships[0]?.organization_id) {
        organizationIdHint = memberships[0].organization_id;
      }
    }
  }

  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-4 flex items-center">
            <TagPill variant="violet">Security</TagPill>
          </div>
          <TenantAuthBrand branding={tenantBranding} caption="Company account security" />
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Change your password</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            {reason === "first_login"
              ? "For security, you must change your temporary password before continuing."
              : "Set a new password to restore access to the platform."}
          </p>

          {params.error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </div>
          ) : null}

          <form action={updatePasswordAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--gbp-text)]">
                New password
              </label>
              <PasswordInput
                id="password"
                name="password"
                minLength={8}
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm_password" className="mb-1 block text-sm font-medium text-[var(--gbp-text)]">
                Confirm password
              </label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                minLength={8}
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="Re-enter your password"
              />
            </div>

            <SubmitButton
              label="Update password"
              pendingLabel="Updating..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
