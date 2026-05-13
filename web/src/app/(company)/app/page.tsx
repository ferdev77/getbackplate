import { redirect } from "next/navigation";
import { requireCompanyAccess } from "@/shared/lib/access";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";

const MODULE_PRIORITY = ["dashboard", "settings", "qbo_r365", "employees", "documents", "checklists", "reports", "announcements", "vendors", "ai_assistant"];
const MODULE_PATHS: Record<string, string> = {
  dashboard: "/app/dashboard",
  settings: "/app/settings",
  qbo_r365: "/app/integrations/quickbooks",
  employees: "/app/employees",
  documents: "/app/documents",
  checklists: "/app/checklists",
  reports: "/app/reports",
  announcements: "/app/announcements",
  vendors: "/app/vendors",
  ai_assistant: "/app/dashboard",
};

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function CompanyHomePage({ searchParams }: Props) {
  const tenant = await requireCompanyAccess();
  const params = await searchParams;

  const enabledModules = new Set(await getEnabledModulesCached(tenant.organizationId));
  const firstAvailable = MODULE_PRIORITY.find((m) => enabledModules.has(m));

  if (firstAvailable) {
    const target = MODULE_PATHS[firstAvailable];
    const qs = params?.message ? `?status=error&message=${encodeURIComponent(params.message)}` : "";
    redirect(`${target}${qs}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <p className="text-lg font-semibold">No hay módulos disponibles para esta empresa.</p>
      <p className="text-sm text-muted-foreground">Contacta al administrador de la plataforma para activar módulos.</p>
    </div>
  );
}
