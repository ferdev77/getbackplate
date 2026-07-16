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

export default async function SuperadminTrashPage() {
  await requireSuperadmin();
  const supabase = createSupabaseAdminClient();
  const auditSince = new Date(new Date().getTime() - 365 * 86_400_000).toISOString();

  // Get ALL deleted documents with their corresponding organization
  const [{ data: documents }, { data: auditLogs }] = await Promise.all([supabase
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
    .range(0, 4999)]);
  const organizationIds = [...new Set((auditLogs ?? []).map((log) => log.organization_id).filter((id): id is string => Boolean(id)))];
  const actorIds = (auditLogs ?? []).map((log) => log.actor_user_id).filter((id): id is string => Boolean(id));
  const [{ data: organizations }, emails] = await Promise.all([
    organizationIds.length ? supabase.from("organizations").select("id, name").in("id", organizationIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    getAuthEmailByUserId(actorIds),
  ]);
  const organizationNames = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
  const deletionLogs: DeletionAuditLog[] = (auditLogs ?? []).map((log) => ({
    id: log.id, action: log.action, entity_id: log.entity_id, entity_type: log.entity_type, created_at: log.created_at,
    organization_name: log.organization_id ? organizationNames.get(log.organization_id) ?? null : null,
    actor_email: log.actor_user_id ? emails.get(log.actor_user_id) ?? null : null,
    metadata: log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
      ? {
          document_title: typeof log.metadata.document_title === "string" ? log.metadata.document_title : null,
          outcome: log.metadata.outcome === "success" ? "success" : "failed",
        }
      : { outcome: "failed" },
  }));

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
