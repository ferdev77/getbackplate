import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import { DevelopmentReportViewer } from "../report-viewer";

export const dynamic = "force-dynamic";

export default async function DevelopmentReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const isPublisher = user.email?.trim().toLowerCase() === "fer@soliz.com";
  const { reportId } = await params;
  const { data: report } = await createSupabaseAdminClient()
    .from("development_ledger_reports")
    .select("id, title, publication_status, price_state")
    .eq("id", reportId)
    .maybeSingle();
  if (!report || (report.publication_status !== "published" && !isPublisher)) notFound();
  const initialPrices = report.price_state && typeof report.price_state === "object" && !Array.isArray(report.price_state)
    ? Object.fromEntries(Object.entries(report.price_state).map(([key, value]) => [key, String(value)]))
    : {};

  return <PageContent spacing="roomy" className="space-y-4">
    <Link href="/superadmin/development-log" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"><ArrowLeft className="h-4 w-4" />Volver al registro</Link>
    <DevelopmentReportViewer reportId={report.id} title={report.title} editable={isPublisher && report.publication_status === "draft"} initialPrices={initialPrices} />
  </PageContent>;
}
