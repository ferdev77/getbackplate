import { Trash2 } from "lucide-react";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { SuperadminTrashTabs, type DeletionAuditLog } from "@/modules/trash/ui/superadmin-trash-tabs";
import { SlideUp } from "@/shared/ui/animations";
import { PageContent } from "@/shared/ui/page-content";

type TrashedDocumentRow = {
  id: string;
  title: string;
  file_size_bytes: number;
  deleted_at: string;
  organization_id: string;
  organizations?: { name: string } | null;
};

type AuditMetadata = {
  document_title?: unknown;
  name?: unknown;
  slug?: unknown;
  outcome?: unknown;
};

export default async function SuperadminTrashPage() {
  await requireSuperadmin();
  const supabase = createSupabaseAdminClient();
  const auditSince = new Date(new Date().getTime() - 365 * 86_400_000).toISOString();

  // Get ALL deleted documents with their corresponding organization
  const [{ data: documents }, { data: auditLogs }, { data: maintenanceLogs }] = await Promise.all([supabase
    .from("documents")
    .select("id, title, file_size_bytes, deleted_at, organization_id, organizations(name)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300), supabase
    .from("audit_logs")
    .select("id, action, entity_id, entity_type, created_at, organization_id, actor_user_id, metadata")
    .gte("created_at", auditSince)
    .or("action.ilike.%delete%,action.ilike.%restore%,action.ilike.%purge%")
    .order("created_at", { ascending: false })
    .range(0, 4999), supabase
    .from("system_maintenance_logs")
    .select("id, task, status, records_affected, cutoff_at, error_message, ran_at")
    .eq("task", "audit_logs_retention")
    .gte("ran_at", auditSince)
    .order("ran_at", { ascending: false })
    .limit(500)]);
  const organizationIds = [...new Set((auditLogs ?? []).map((log) => log.organization_id).filter((id): id is string => Boolean(id)))];
  const actorIds = (auditLogs ?? []).map((log) => log.actor_user_id).filter((id): id is string => Boolean(id));
  const [{ data: organizations }, emails] = await Promise.all([
    organizationIds.length ? supabase.from("organizations").select("id, name").in("id", organizationIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    getAuthEmailByUserId(actorIds),
  ]);
  const organizationNames = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
  const deletionLogs: DeletionAuditLog[] = [
    ...(auditLogs ?? []).map((log) => {
      const metadata = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
        ? log.metadata as AuditMetadata
        : null;
      return {
        id: log.id,
        action: log.action,
        entity_id: log.entity_id,
        entity_type: log.entity_type,
        created_at: log.created_at,
        organization_name: log.organization_id ? organizationNames.get(log.organization_id) ?? null : null,
        actor_email: log.actor_user_id ? emails.get(log.actor_user_id) ?? null : null,
        metadata: {
          document_title: typeof metadata?.document_title === "string" ? metadata.document_title : null,
          entity_name: typeof metadata?.name === "string" ? metadata.name : null,
          entity_slug: typeof metadata?.slug === "string" ? metadata.slug : null,
          outcome: metadata?.outcome === "success" || metadata?.outcome === "denied" || metadata?.outcome === "error"
            ? metadata.outcome
            : "unknown",
        },
      } satisfies DeletionAuditLog;
    }),
    ...(maintenanceLogs ?? []).map((log) => ({
      id: log.id,
      action: "audit_logs.retention.purge",
      entity_id: null,
      entity_type: "audit_log",
      created_at: log.ran_at,
      organization_name: null,
      actor_email: null,
      metadata: {
        outcome: log.status,
        system_maintenance: true,
        records_affected: log.records_affected,
        cutoff_at: log.cutoff_at,
        error_message: log.error_message,
      },
    } satisfies DeletionAuditLog)),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <PageContent spacing="roomy" className="space-y-6">
      <SlideUp>
        <section className="mb-8 flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[var(--gbp-text)]">
            <Trash2 className="h-5 w-5 text-[var(--gbp-accent)]" />
            <h1 className="text-lg font-bold">Global Trash</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Recover deleted documents and review deletion lifecycle activity. Documents are retained for up to 30 days.
          </p>
        </section>
      </SlideUp>

      <SlideUp delay={0.1}>
        <SuperadminTrashTabs documents={(documents as TrashedDocumentRow[] | null) ?? []} auditLogs={deletionLogs} />
      </SlideUp>
    </PageContent>
  );
}
