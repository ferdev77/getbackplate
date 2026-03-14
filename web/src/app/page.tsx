import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
} from "@/modules/memberships/queries";
import { getActivePlans } from "@/modules/plans/queries";
import { 
  LandingNavbar, 
  LandingHero, 
  LandingFeatures, 
  LandingPricing, 
  LandingFooter 
} from "@/shared/ui/landing-components";

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

  const plans = await getActivePlans();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-brand/10 selection:text-brand">
      <LandingNavbar />
      
      <main>
        <LandingHero />
        <LandingFeatures />
        <LandingPricing plans={plans} />
      </main>

      <LandingFooter />
    </div>
  );
}

