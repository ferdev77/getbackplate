"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LeadActionResult = { ok: true } | { ok: false; error: string };
export type LeadNoteResult =
  | { ok: true; note: { id: string; body: string; createdAt: string; authorId: string } }
  | { ok: false; error: string };

export type LeadProfileInput = {
  referrerName: string;
  referrerEmail: string;
  vendorName: string;
  vendorContact: string;
  vendorEmail: string;
  vendorPhone: string;
};

function validId(id: string) {
  return UUID_RE.test(id);
}

function validIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.length > 0 && uniqueIds.length <= 100 && uniqueIds.every(validId) ? uniqueIds : null;
}

function refreshLeads() {
  revalidatePath("/superadmin/leads");
}

async function validateAssignee(assignedTo: string | null) {
  if (!assignedTo) return true;
  if (!validId(assignedTo)) return false;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("superadmin_users").select("user_id").eq("user_id", assignedTo).maybeSingle();
  return Boolean(data);
}

export async function updateLeadStatusAction(id: string, status: string): Promise<LeadActionResult> {
  await requireSuperadmin();
  if (!validId(id) || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return { ok: false, error: "Invalid lead status" };
  }

  const admin = createSupabaseAdminClient();
  const { data: lead, error: readError } = await admin
    .from("superadmin_leads")
    .select("resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (readError || !lead) return { ok: false, error: "Lead not found" };

  const isResolved = status === "won" || status === "lost";
  const { data, error } = await admin
    .from("superadmin_leads")
    .update({ status, resolved_at: isResolved ? lead.resolved_at ?? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Unable to update lead status" };
  refreshLeads();
  return { ok: true };
}

export async function updateLeadsStatusAction(ids: string[], status: string): Promise<LeadActionResult> {
  await requireSuperadmin();
  const uniqueIds = validIds(ids);
  if (!uniqueIds || !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return { ok: false, error: "Invalid lead status selection" };
  }
  const isResolved = status === "won" || status === "lost";
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("superadmin_leads")
    .update({ status, resolved_at: isResolved ? new Date().toISOString() : null })
    .in("id", uniqueIds);
  if (error) return { ok: false, error: "Unable to update selected leads" };
  refreshLeads();
  return { ok: true };
}

export async function updateLeadAssigneeAction(id: string, assignedTo: string | null): Promise<LeadActionResult> {
  await requireSuperadmin();
  if (!validId(id) || !(await validateAssignee(assignedTo))) {
    return { ok: false, error: "Invalid lead assignment" };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("superadmin_leads")
    .update({ assigned_to: assignedTo })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Unable to assign lead" };
  refreshLeads();
  return { ok: true };
}

export async function updateLeadsAssigneeAction(ids: string[], assignedTo: string | null): Promise<LeadActionResult> {
  await requireSuperadmin();
  const uniqueIds = validIds(ids);
  if (!uniqueIds || !(await validateAssignee(assignedTo))) {
    return { ok: false, error: "Invalid lead assignment" };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("superadmin_leads").update({ assigned_to: assignedTo }).in("id", uniqueIds);
  if (error) return { ok: false, error: "Unable to assign selected leads" };
  refreshLeads();
  return { ok: true };
}

export async function updateLeadProfileAction(id: string, input: LeadProfileInput): Promise<LeadActionResult> {
  await requireSuperadmin();
  const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.trim()])) as LeadProfileInput;
  if (
    !validId(id)
    || !values.vendorName
    || !values.vendorContact
    || !EMAIL_RE.test(values.vendorEmail)
    || (values.referrerEmail && !EMAIL_RE.test(values.referrerEmail))
    || Object.values(values).some((value) => value.length > 300)
  ) return { ok: false, error: "Invalid referral details" };

  const admin = createSupabaseAdminClient();
  const { data: lead, error: readError } = await admin.from("superadmin_leads").select("metadata").eq("id", id).maybeSingle();
  if (readError || !lead) return { ok: false, error: "Lead not found" };
  const metadata = lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
    ? lead.metadata as Record<string, unknown>
    : {};
  const { data, error } = await admin
    .from("superadmin_leads")
    .update({
      contact_name: values.vendorContact,
      contact_email: values.vendorEmail,
      contact_phone: values.vendorPhone || null,
      company_name: values.vendorName,
      metadata: {
        ...metadata,
        referrerName: values.referrerName || null,
        referrerEmail: values.referrerEmail || null,
        referrerBranchName: values.referrerName || null,
      },
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Unable to update referral details" };
  refreshLeads();
  return { ok: true };
}

export async function updateLeadFollowUpAction(id: string, nextFollowUpAt: string | null): Promise<LeadActionResult> {
  await requireSuperadmin();
  if (!validId(id) || (nextFollowUpAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowUpAt))) {
    return { ok: false, error: "Invalid follow-up date" };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("superadmin_leads")
    .update({ next_follow_up_at: nextFollowUpAt })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Unable to update follow-up" };
  refreshLeads();
  return { ok: true };
}

export async function addLeadNoteAction(id: string, body: string): Promise<LeadNoteResult> {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const normalizedBody = body.trim();
  if (!validId(id) || !normalizedBody || normalizedBody.length > 10_000) {
    return { ok: false, error: "Invalid lead note" };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("superadmin_lead_notes")
    .insert({ lead_id: id, author_id: user.id, body: normalizedBody })
    .select("id, body, created_at, author_id")
    .single();
  if (error || !data) return { ok: false, error: "Unable to add lead note" };
  await admin.from("superadmin_leads").update({ last_contacted_at: data.created_at }).eq("id", id);
  refreshLeads();
  return { ok: true, note: { id: data.id, body: data.body, createdAt: data.created_at, authorId: data.author_id! } };
}

export async function deleteLeadsAction(ids: string[]): Promise<LeadActionResult> {
  await requireSuperadmin();
  const uniqueIds = validIds(ids);
  if (!uniqueIds) return { ok: false, error: "Invalid lead selection" };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("superadmin_leads").delete().in("id", uniqueIds);
  if (error) return { ok: false, error: "Unable to delete selected leads" };
  refreshLeads();
  return { ok: true };
}
