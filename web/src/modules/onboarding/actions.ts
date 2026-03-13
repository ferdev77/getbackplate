"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantContext } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

export async function markEmployeeOnboardingSeenAction() {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    redirect("/auth/login");
  }

  await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      organization_id: tenant.organizationId,
      onboarding_seen_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" },
  );

  await logAuditEvent({
    action: "onboarding.seen.mark",
    entityType: "user_preference",
    entityId: userId,
    organizationId: tenant.organizationId,
    eventDomain: "onboarding",
    outcome: "success",
    severity: "low",
  });

  revalidatePath("/portal/home");
  redirect("/portal/home");
}
