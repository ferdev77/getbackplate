import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
} from "@/modules/memberships/queries";
import {
  resolveOrganizationIdFromAuthContext,
  resolvePublicOrganizationHintById,
} from "@/shared/lib/tenant-auth-branding";
import { resolveCanonicalAppUrl } from "@/shared/lib/app-url";
import { normalizeRequestHost } from "@/shared/lib/custom-domains";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const organizationIdByHost = await resolveOrganizationIdFromAuthContext({ host: requestHost });
  const organizationHintByHost = organizationIdByHost
    ? await resolvePublicOrganizationHintById(organizationIdByHost)
    : "";
  const orgQuery = organizationHintByHost ? `?org=${encodeURIComponent(organizationHintByHost)}` : "";
  const user = await getCurrentUser();
  const isSuperadmin = user ? await isCurrentUserSuperadmin() : false;

  if (user) {
    if (isSuperadmin) {
      redirect("/superadmin/dashboard");
    }

    const memberships = await getCurrentUserMemberships();
    const codes = new Set(memberships.map((row) => row.roleCode));

    if (codes.has("company_admin")) {
      redirect(`/app/dashboard${orgQuery}`);
    }

    if (codes.has("employee")) {
      redirect(`/portal/home${orgQuery}`);
    }

    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Your account does not have assigned access. Contact an administrator."),
    );
  }

  if (organizationIdByHost) {
    redirect(`/auth/login${orgQuery}`);
  }

  // app.getbackplate.com is reserved for the app (login/dashboard/portal) — anonymous
  // visitors go straight to login. Every other host (getbackplate.com, its www alias,
  // getbackplate.vercel.app, local dev, etc.) is the marketing entry point, which is
  // the QBO<->R365 integration landing rather than the full platform landing.
  const canonicalAppHost = normalizeRequestHost(new URL(resolveCanonicalAppUrl()).hostname);
  const isAppHost = normalizeRequestHost(requestHost) === canonicalAppHost;

  if (isAppHost) {
    redirect("/auth/login");
  }

  redirect("/integrations/qbo-r365");
}
