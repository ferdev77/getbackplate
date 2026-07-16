"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

export async function updateLeadAction(id: string, status: string, notes: string) {
  await requireSuperadmin();

  if (!id || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    throw new Error("Invalid lead update");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("superadmin_leads")
    .update({
      status,
      notes: notes.trim() || null,
      resolved_at: status === "won" || status === "lost" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/superadmin/leads");
}
