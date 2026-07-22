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
  metadata: Record<string, unknown> | null;
  created_at: string;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
};

type NoteRecord = { id: string; lead_id: string; author_id: string | null; body: string; created_at: string };

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

function metadataText(metadata: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export default async function SuperadminLeadsPage() {
  const currentUser = await requireAuthenticatedUser();
  await requireSuperadmin();
  // This forced-dynamic page captures one clock value so every client-side date filter agrees.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  const today = new Date(renderedAt).toISOString().slice(0, 10);

  const supabase = createSupabaseAdminClient();
  const [{ data, error }, { data: superadminRows, error: superadminError }] = await Promise.all([
    supabase
      .from("superadmin_leads")
      .select("id, source, status, contact_name, contact_email, contact_phone, company_name, assigned_to, metadata, created_at, last_contacted_at, next_follow_up_at")
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

  const leadIds = (data ?? []).map((lead) => lead.id as string);
  const { data: noteRows, error: notesError } = leadIds.length
    ? await supabase
        .from("superadmin_lead_notes")
        .select("id, lead_id, author_id, body, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (notesError) throw new Error(`Unable to load lead activity: ${notesError.message}`);

  const assigneeNames = new Map(assignees.map((assignee) => [assignee.id, assignee.name]));
  const notesByLead = new Map<string, LeadRow["activity"]>();
  for (const note of (noteRows ?? []) as NoteRecord[]) {
    const notes = notesByLead.get(note.lead_id) ?? [];
    notes.push({
      id: note.id,
      body: note.body,
      createdAt: note.created_at,
      authorId: note.author_id,
      authorName: note.author_id ? assigneeNames.get(note.author_id) ?? "Former superadmin" : "Legacy note",
    });
    notesByLead.set(note.lead_id, notes);
  }

  const leads: LeadRow[] = ((data ?? []) as LeadRecord[]).map((lead) => ({
    id: lead.id,
    source: lead.source,
    origin: getOrigin(lead),
    status: lead.status,
    referrerName: metadataText(lead.metadata, "referrerName", "referrerBranchName") || (lead.source === "seat_request" ? "Direct signup" : "Unknown referrer"),
    referrerEmail: metadataText(lead.metadata, "referrerEmail"),
    vendorName: lead.company_name || lead.contact_name,
    vendorContact: lead.contact_name,
    vendorEmail: lead.contact_email,
    vendorPhone: lead.contact_phone,
    assignedTo: lead.assigned_to,
    createdAt: lead.created_at,
    lastContactedAt: lead.last_contacted_at,
    nextFollowUpAt: lead.next_follow_up_at,
    activity: notesByLead.get(lead.id) ?? [],
  }));

  return (
    <PageContent spacing="roomy">
      <LeadsTable
        leads={leads}
        assignees={assignees}
        currentUserName={extractDisplayName(currentUser)}
        renderedAt={renderedAt}
        today={today}
      />
    </PageContent>
  );
}
