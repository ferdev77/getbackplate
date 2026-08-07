import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { databaseRowToLedgerItem } from "@/modules/superadmin/development-ledger/types";
import type { DevelopmentLedgerReport } from "@/modules/superadmin/development-ledger/types";
import { requireSuperadmin } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import { DevelopmentLogClient } from "./development-log-client";

export const dynamic = "force-dynamic";

export default async function DevelopmentLogPage() {
  await requireSuperadmin();
  const admin = createSupabaseAdminClient();
  const [{ data: itemRows, error: itemError }, { data: reportRows, error: reportError }] = await Promise.all([
    admin.from("development_ledger_items").select("*").is("archived_at", null).order("sort_order", { ascending: true }).order("id", { ascending: true }),
    admin.from("development_ledger_reports").select("id, title, date_from, date_to, item_count, total_cents, currency, content_sha256, generated_at").order("generated_at", { ascending: false }),
  ]);
  if (itemError) throw new Error(`Unable to load development ledger: ${itemError.message}`);
  if (reportError) throw new Error(`Unable to load development reports: ${reportError.message}`);
  const reports: DevelopmentLedgerReport[] = (reportRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    itemCount: row.item_count,
    totalCents: row.total_cents,
    currency: row.currency,
    contentSha256: row.content_sha256,
    generatedAt: row.generated_at,
  }));

  return <PageContent spacing="roomy"><DevelopmentLogClient items={(itemRows ?? []).map((row) => databaseRowToLedgerItem(row))} reports={reports} /></PageContent>;
}
