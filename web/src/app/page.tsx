import { redirect } from "next/navigation";
import { headers } from "next/headers";

import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
} from "@/modules/memberships/queries";
import { getActivePlansForLanding } from "@/modules/plans/queries";
import { LandingExperience } from "@/modules/landing/ui/landing-experience";
import {
  resolveOrganizationIdFromAuthContext,
  resolvePublicOrganizationHintById,
} from "@/shared/lib/tenant-auth-branding";

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
        encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
    );
  }

  if (organizationIdByHost) {
    redirect(`/auth/login${orgQuery}`);
  }

  const plans = await getActivePlansForLanding();

  return (
    <LandingExperience plans={plans} />
  );
}
