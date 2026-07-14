import type { Metadata } from "next";

import {
  getActivePlansForIntegration,
  getActivePlansForLanding,
} from "@/modules/plans/queries";
import { LandingExperience } from "@/modules/landing/ui/landing-experience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GetBackplate — Operations Platform",
};

export default async function PlatformPage() {
  const [plans, integrationPlans] = await Promise.all([
    getActivePlansForLanding(),
    getActivePlansForIntegration("qbo_r365"),
  ]);

  return (
    <LandingExperience plans={plans} integrationPlans={integrationPlans} />
  );
}
