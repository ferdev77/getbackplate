import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { notifySuperadmins } from "@/infrastructure/push/notify-superadmins";

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

const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  seat_request: "Seat request",
  public_referral: "Public referral",
  private_referral: "Private referral",
};

/**
 * Fire-and-forget push to every superadmin with an active subscription.
 * Only call this right after a lead is confirmed newly created (not from the
 * reconciliation cron) so superadmins aren't re-notified about old leads.
 */
export async function notifyNewLead(lead: {
  source: LeadSource;
  contactName: string;
  contactEmail: string;
  companyName?: string | null;
}): Promise<void> {
  try {
    await notifySuperadmins(
      {
        title: "New lead",
        body: `${LEAD_SOURCE_LABELS[lead.source]}: ${lead.companyName ?? lead.contactName} (${lead.contactEmail})`,
        url: "/superadmin/leads",
      },
      { source: "new_lead" },
    );
  } catch (err) {
    console.error("[leads] Failed to notify superadmins of new lead:", err instanceof Error ? err.message : err);
  }
}

type ReconcileResult = {
  ok: boolean;
  publicReferralsChecked: number;
  privateReferralsChecked: number;
  errors: string[];
};

/**
 * Re-runs createLead() for referrals created within the lookback window.
 * createLead() upserts on (source, source_record_id), so calling it again for a
 * referral that already has a lead is a no-op — safe to run on every invocation.
 * This recovers leads that failed to insert on first attempt (transient error,
 * the API request timing out, etc.) without needing to track which ones failed.
 */
export async function reconcileOrphanReferralLeads(windowDays = 14): Promise<ReconcileResult> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  const { data: publicReferrals, error: publicFetchError } = await supabase
    .from("qbo_public_vendor_referrals")
    .select("id, referrer_name, referrer_email, vendor_company, vendor_contact_name, vendor_email")
    .gte("created_at", cutoff);
  if (publicFetchError) errors.push(`fetch public_referral: ${publicFetchError.message}`);

  for (const referral of publicReferrals ?? []) {
    try {
      await createLead({
        source: "public_referral",
        sourceRecordId: referral.id,
        contactName: referral.vendor_contact_name ?? referral.referrer_name,
        contactEmail: referral.vendor_email,
        companyName: referral.vendor_company,
        metadata: { referrerName: referral.referrer_name, referrerEmail: referral.referrer_email },
      });
    } catch (error) {
      errors.push(`public_referral ${referral.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const { data: privateReferrals, error: privateFetchError } = await supabase
    .from("qbo_vendor_referrals")
    .select("id, organization_id, sync_config_customer_id, referrer_branch_name, vendor_company, vendor_contact_name, vendor_email, vendor_phone")
    .gte("created_at", cutoff);
  if (privateFetchError) errors.push(`fetch private_referral: ${privateFetchError.message}`);

  for (const referral of privateReferrals ?? []) {
    try {
      await createLead({
        source: "private_referral",
        sourceRecordId: referral.id,
        contactName: referral.vendor_contact_name,
        contactEmail: referral.vendor_email,
        contactPhone: referral.vendor_phone,
        companyName: referral.vendor_company,
        metadata: {
          organizationId: referral.organization_id,
          syncConfigCustomerId: referral.sync_config_customer_id,
          referrerBranchName: referral.referrer_branch_name,
        },
      });
    } catch (error) {
      errors.push(`private_referral ${referral.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: errors.length === 0,
    publicReferralsChecked: publicReferrals?.length ?? 0,
    privateReferralsChecked: privateReferrals?.length ?? 0,
    errors,
  };
}
