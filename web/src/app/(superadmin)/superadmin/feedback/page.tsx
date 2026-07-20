import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";
import { PageContent } from "@/shared/ui/page-content";
import {
  UnifiedFeedbackInbox,
  type FeedbackInboxRow,
  type InboxAssignee,
  type SupportInboxRow,
} from "./unified-feedback-inbox";

export const dynamic = "force-dynamic";

type FeedbackRecord = {
  id: string;
  feedback_type: string;
  title: string;
  message: string;
  page_path: string | null;
  source_channel: string | null;
  created_at: string;
  status: string | null;
  user_id: string;
  organizations: { name?: string } | Array<{ name?: string }> | null;
};

type SupportRecord = {
  id: string;
  request_type: string;
  requester_name: string;
  requester_email: string;
  company_name: string | null;
  organization_id: string | null;
  details: string;
  status: string;
  verified_at: string | null;
  resolved_at: string | null;
  assigned_to: string | null;
  internal_notes: string | null;
  acknowledgement_sent_at: string | null;
  internal_notified_at: string | null;
  notification_error: string | null;
  created_at: string;
  updated_at: string;
};

type EventRecord = {
  id: string;
  support_request_id: string;
  actor_id: string | null;
  event_type: string;
  previous_value: Record<string, unknown> | null;
  next_value: Record<string, unknown> | null;
  created_at: string;
};

function organizationName(value: FeedbackRecord["organizations"]) {
  if (!value) return "Empresa eliminada";
  return Array.isArray(value) ? value[0]?.name || "Empresa eliminada" : value.name || "Empresa eliminada";
}

const PAGE_SIZE = 50;

function pageNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SuperadminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; feedbackPage?: string; supportPage?: string }>;
}) {
  const params = await searchParams;
  const feedbackPage = pageNumber(params.feedbackPage);
  const supportPage = pageNumber(params.supportPage);
  const currentUser = await requireAuthenticatedUser();
  await requireSuperadmin();
  const supabase = createSupabaseAdminClient();
  const [feedbackResult, supportResult, feedbackOpenResult, supportOpenResult, superadminsResult] = await Promise.all([
    supabase.from("feedback_messages").select(`
      id, feedback_type, title, message, page_path, source_channel,
      created_at, status, user_id, organizations ( name )
    `, { count: "exact" }).order("created_at", { ascending: false })
      .range((feedbackPage - 1) * PAGE_SIZE, feedbackPage * PAGE_SIZE - 1),
    supabase.from("support_requests").select(`
      id, request_type, requester_name, requester_email, company_name,
      organization_id, details, status, verified_at, resolved_at, assigned_to,
      internal_notes, acknowledgement_sent_at, internal_notified_at,
      notification_error, created_at, updated_at
    `, { count: "exact" }).order("created_at", { ascending: false })
      .range((supportPage - 1) * PAGE_SIZE, supportPage * PAGE_SIZE - 1),
    supabase.from("feedback_messages").select("id", { count: "exact", head: true }).or("status.is.null,status.neq.resolved"),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,rejected)"),
    supabase.from("superadmin_users").select("user_id"),
  ]);

  if (feedbackResult.error) throw new Error(`No se pudo cargar feedback: ${feedbackResult.error.message}`);
  if (supportResult.error) throw new Error(`No se pudo cargar soporte: ${supportResult.error.message}`);
  if (feedbackOpenResult.error || supportOpenResult.error) throw new Error("No se pudieron cargar los contadores del inbox");
  if (superadminsResult.error) throw new Error(`No se pudieron cargar responsables: ${superadminsResult.error.message}`);

  const feedbackRecords = (feedbackResult.data ?? []) as FeedbackRecord[];
  const supportRecords = (supportResult.data ?? []) as SupportRecord[];
  const eventRecords: EventRecord[] = [];
  if (supportRecords.length > 0) {
    const requestIds = supportRecords.map((row) => row.id);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("support_request_events").select(`
        id, support_request_id, actor_id, event_type, previous_value, next_value, created_at
      `).in("support_request_id", requestIds).order("created_at", { ascending: false }).range(offset, offset + 999);
      if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);
      eventRecords.push(...((data ?? []) as EventRecord[]));
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const relevantUserIds = new Set<string>([
    ...feedbackRecords.map((row) => row.user_id),
    ...(superadminsResult.data ?? []).map((row) => row.user_id),
  ]);
  const userEntries: Array<readonly [string, string]> = [];
  const userIds = [...relevantUserIds];
  for (let index = 0; index < userIds.length; index += 20) {
    const batch = await Promise.all(userIds.slice(index, index + 20).map(async (userId) => {
      const { data } = await supabase.auth.admin.getUserById(userId);
      return [userId, data.user ? extractDisplayName(data.user) : userId] as const;
    }));
    userEntries.push(...batch);
  }
  const userNames = new Map(userEntries);

  const assignees: InboxAssignee[] = (superadminsResult.data ?? [])
    .map(({ user_id }) => ({ id: user_id, name: userNames.get(user_id) ?? user_id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const eventsByRequest = new Map<string, EventRecord[]>();
  for (const event of eventRecords) {
    const current = eventsByRequest.get(event.support_request_id) ?? [];
    current.push(event);
    eventsByRequest.set(event.support_request_id, current);
  }

  const feedback: FeedbackInboxRow[] = feedbackRecords.map((row) => ({
    id: row.id,
    type: row.feedback_type,
    title: row.title,
    message: row.message,
    pagePath: row.page_path,
    source: row.source_channel === "employee" || row.page_path?.startsWith("/portal/") ? "employee" : "company",
    status: row.status ?? "open",
    userName: userNames.get(row.user_id) ?? "Usuario desconocido",
    organizationName: organizationName(row.organizations),
    createdAt: row.created_at,
  }));
  const supportRequests: SupportInboxRow[] = supportRecords.map((row) => ({
    id: row.id,
    type: row.request_type,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    companyName: row.company_name,
    organizationId: row.organization_id,
    details: row.details,
    status: row.status,
    verifiedAt: row.verified_at,
    resolvedAt: row.resolved_at,
    assignedTo: row.assigned_to,
    internalNotes: row.internal_notes,
    acknowledgementSentAt: row.acknowledgement_sent_at,
    internalNotifiedAt: row.internal_notified_at,
    notificationError: row.notification_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: (eventsByRequest.get(row.id) ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      actorName: event.actor_id ? userNames.get(event.actor_id) ?? "Superadmin" : "Sistema",
      previousValue: event.previous_value,
      nextValue: event.next_value,
      createdAt: event.created_at,
    })),
  }));

  return (
    <PageContent spacing="roomy">
      <UnifiedFeedbackInbox
        feedback={feedback}
        supportRequests={supportRequests}
        assignees={assignees}
        currentUserId={currentUser.id}
        initialTab={params.tab === "support" ? "support" : "feedback"}
        feedbackPage={feedbackPage}
        supportPage={supportPage}
        feedbackTotal={feedbackResult.count ?? 0}
        supportTotal={supportResult.count ?? 0}
        feedbackOpenTotal={feedbackOpenResult.count ?? 0}
        supportOpenTotal={supportOpenResult.count ?? 0}
        pageSize={PAGE_SIZE}
      />
    </PageContent>
  );
}
