import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
} from "@/modules/memberships/queries";
import { getActivePlansForLanding } from "@/modules/plans/queries";
import { LandingExperience } from "@/modules/landing/ui/landing-experience";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  const isSuperadmin = user ? await isCurrentUserSuperadmin() : false;

  if (user) {
    if (isSuperadmin) {
      redirect("/superadmin/dashboard");
    }

    const memberships = await getCurrentUserMemberships();
    const codes = new Set(memberships.map((row) => row.roleCode));

    if (codes.has("company_admin") || codes.has("manager")) {
      redirect("/app/dashboard");
    }

    if (codes.has("employee")) {
      redirect("/portal/home");
    }

    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
    );
  }

  const plans = await getActivePlansForLanding();

  return (
    <LandingExperience plans={plans} />
  );
}
