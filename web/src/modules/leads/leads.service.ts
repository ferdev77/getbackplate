import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

const LEAD_SOURCES = ["seat_request", "public_referral", "private_referral"] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export type CreateLeadInput = {
  source: LeadSource;
  sourceRecordId?: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  companyName?: string | null;
  metadata?: Record<string, unknown>;
};

export async function createLead(input: CreateLeadInput): Promise<void> {
  if (!LEAD_SOURCES.includes(input.source)) {
    throw new Error("Invalid lead source");
  }

  const supabase = createSupabaseAdminClient();
  const lead = {
    source: input.source,
    source_record_id: input.sourceRecordId ?? null,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone ?? null,
    company_name: input.companyName ?? null,
    metadata: input.metadata ?? {},
  };

  const query = input.sourceRecordId
    ? supabase.from("superadmin_leads").upsert(lead, { onConflict: "source,source_record_id" })
    : supabase.from("superadmin_leads").insert(lead);
  const { error } = await query;

  if (error) throw new Error(`Failed to create lead: ${error.message}`);
}
