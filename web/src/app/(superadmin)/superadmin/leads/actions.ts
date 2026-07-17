"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LeadActionResult =
  | { ok: true }
  | { ok: false; error: string };

function validId(id: string) {
  return UUID_RE.test(id);
}

function refreshLeads() {
  revalidatePath("/superadmin/leads");
}

export async function updateLeadStatusAction(id: string, status: string): Promise<LeadActionResult> {
  await requireSuperadmin();

  if (!validId(id) || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return { ok: false, error: "Invalid lead status" };
  }

  const supabase = createSupabaseAdminClient();
  const { data: lead, error: readError } = await supabase
    .from("superadmin_leads")
    .select("resolved_at")
    .eq("id", id)
    .maybeSingle();

  if (readError || !lead) return { ok: false, error: "Lead not found" };

  const isResolved = status === "won" || status === "lost";
  const { data, error } = await supabase
    .from("superadmin_leads")
    .update({
      status,
      resolved_at: isResolved ? lead.resolved_at ?? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Unable to update lead status" };

  refreshLeads();
  return { ok: true };
}

export async function updateLeadAssigneeAction(id: string, assignedTo: string | null): Promise<LeadActionResult> {
  await requireSuperadmin();

  if (!validId(id) || (assignedTo !== null && !validId(assignedTo))) {
    return { ok: false, error: "Invalid lead assignment" };
  }

  const supabase = createSupabaseAdminClient();
  if (assignedTo) {
    const { data: assignee } = await supabase
      .from("superadmin_users")
      .select("user_id")
      .eq("user_id", assignedTo)
      .maybeSingle();
    if (!assignee) return { ok: false, error: "Assignee is not a superadmin" };
  }

  const { data, error } = await supabase
    .from("superadmin_leads")
    .update({ assigned_to: assignedTo })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Unable to assign lead" };

  refreshLeads();
  return { ok: true };
}

export async function updateLeadNotesAction(id: string, notes: string): Promise<LeadActionResult> {
  await requireSuperadmin();

  if (!validId(id) || notes.length > 10_000) {
    return { ok: false, error: "Invalid lead notes" };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("superadmin_leads")
    .update({ notes: notes.trim() || null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Unable to save lead notes" };

  refreshLeads();
  return { ok: true };
}

export async function deleteLeadsAction(ids: string[]): Promise<LeadActionResult> {
  await requireSuperadmin();

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0 || uniqueIds.length > 100 || uniqueIds.some((id) => !validId(id))) {
    return { ok: false, error: "Invalid lead selection" };
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("superadmin_leads")
    .delete()
    .in("id", uniqueIds);

  if (error) return { ok: false, error: "Unable to delete selected leads" };

  refreshLeads();
  return { ok: true };
}
