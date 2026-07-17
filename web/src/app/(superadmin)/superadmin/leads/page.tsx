import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";
import { PageContent } from "@/shared/ui/page-content";
import { LeadsTable, type Assignee, type LeadRow } from "./leads-table";

export const dynamic = "force-dynamic";

type LeadRecord = {
  id: string;
  source: string;
  status: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company_name: string | null;
  assigned_to: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  seat_request: "Seat request",
  public_referral: "Public referral",
  private_referral: "Private referral",
};

function getOrigin(lead: LeadRecord) {
  const metadataOrigin = lead.metadata?.source;
  if (lead.source === "seat_request" && typeof metadataOrigin === "string" && metadataOrigin.trim()) {
    return metadataOrigin.trim();
  }
  return SOURCE_LABELS[lead.source] ?? lead.source;
}

export default async function SuperadminLeadsPage() {
  const currentUser = await requireAuthenticatedUser();
  await requireSuperadmin();

  const supabase = createSupabaseAdminClient();
  const [{ data, error }, { data: superadminRows, error: superadminError }] = await Promise.all([
    supabase
      .from("superadmin_leads")
      .select("id, source, status, contact_name, contact_email, contact_phone, company_name, assigned_to, notes, metadata, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("superadmin_users").select("user_id"),
  ]);

  if (error) throw new Error(`Unable to load leads: ${error.message}`);
  if (superadminError) throw new Error(`Unable to load assignees: ${superadminError.message}`);

  const assignees = (await Promise.all(
    (superadminRows ?? []).map(async ({ user_id }) => {
      const { data: authData } = await supabase.auth.admin.getUserById(user_id);
      if (!authData.user) return null;
      return {
        id: user_id,
        name: extractDisplayName(authData.user),
      } satisfies Assignee;
    }),
  ))
    .filter((assignee): assignee is Assignee => assignee !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const leads: LeadRow[] = ((data ?? []) as LeadRecord[]).map((lead) => ({
    id: lead.id,
    source: lead.source,
    origin: getOrigin(lead),
    status: lead.status,
    contactName: lead.contact_name,
    contactEmail: lead.contact_email,
    contactPhone: lead.contact_phone,
    companyName: lead.company_name,
    assignedTo: lead.assigned_to,
    notes: lead.notes,
    createdAt: lead.created_at,
  }));

  return (
    <PageContent spacing="roomy">
      <LeadsTable leads={leads} assignees={assignees} currentUserId={currentUser.id} />
    </PageContent>
  );
}
