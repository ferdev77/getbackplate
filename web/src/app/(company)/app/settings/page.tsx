import { Building2, MapPin, Settings2 } from "lucide-react";
import { headers } from "next/headers";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import {
  createBranchAction,
  createDepartmentAction,
  createDepartmentPositionAction,
  toggleBranchStatusAction,
  toggleDepartmentPositionStatusAction,
  toggleDepartmentStatusAction,
  updateBranchAction,
  updateDepartmentAction,
  deleteBranchAction,
  deleteDepartmentAction,
  updateDepartmentPositionAction,
  deleteDepartmentPositionAction,
} from "@/modules/settings/actions";
import { InlineBranchForm } from "@/modules/settings/ui/inline-branch-form";
import { InlineDepartmentForm } from "@/modules/settings/ui/inline-department-form";
import { CompanyContactSettingsCard } from "@/modules/settings/ui/company-contact-settings-card";
import { CustomDomainSettingsCard } from "@/modules/settings/ui/custom-domain-settings-card";
import { GoogleOAuthSettingsCard } from "@/modules/settings/ui/google-oauth-settings-card";
import { getTenantGoogleOAuthStatus } from "@/modules/auth/google-tenant/service";
import { BranchList } from "@/modules/settings/ui/branch-list";
import { ReorderableDepartmentList } from "@/modules/settings/ui/reorderable-department-list";
import { isModuleEnabledForOrganization, requireTenantModule } from "@/shared/lib/access";
import { DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET } from "@/shared/lib/custom-domains";
import { normalizeRequestHost } from "@/shared/lib/custom-domains";
import { PageContent } from "@/shared/ui/page-content";
import { hasMissingColumnError } from "@/shared/lib/supabase-compat";
import { resolveOrganizationLocale } from "@/shared/lib/locale-policy";
import { createTranslator } from "@/modules/settings/ui/settings.i18n";

type CompanySettingsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; departmentId?: string; google_oauth?: string }>;
};

const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";

type BranchRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
};

type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type PositionRow = {
  id: string;
  department_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export default async function CompanySettingsPage({ searchParams }: CompanySettingsPageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const requestHost = normalizeRequestHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const [customBrandingEnabled, { data: organization }] = await Promise.all([
    isModuleEnabledForOrganization(tenant.organizationId, "custom_branding"),
    supabase
      .from("organizations")
      .select("name, plan_id, integration_plan_id")
      .eq("id", tenant.organizationId)
      .maybeSingle(),
  ]);
  const locale = resolveOrganizationLocale(organization?.integration_plan_id);
  const t = createTranslator(locale);

  const [
    { data: orgSettings },
    { data: brandingSettings },
    { data: customDomains },
  ] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "contact_name, support_email, support_phone, address, feedback_whatsapp, website_url",
      )
      .eq("organization_id", tenant.organizationId)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select("company_logo_url, company_logo_dark_url, company_favicon_url")
      .eq("organization_id", tenant.organizationId)
      .maybeSingle(),
    supabase
      .from("organization_domains")
      .select("id, domain, status, is_primary, dns_target, verification_error, verified_at, activated_at, last_checked_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false }),
  ]);

  const branchesResult = await supabase
    .from("branches")
    .select("id, name, city, state, country, address, phone, is_active, created_at, sort_order")
    .eq("organization_id", tenant.organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(30);

  const branchesData: BranchRow[] = hasMissingColumnError(branchesResult.error, "sort_order")
    ? (
        await supabase
          .from("branches")
          .select("id, name, city, state, country, address, phone, is_active, created_at")
          .eq("organization_id", tenant.organizationId)
          .order("created_at", { ascending: false })
          .limit(30)
      ).data?.map((row, index) => ({ ...row, sort_order: index })) ?? []
    : (branchesResult.data ?? []).map((row, index) => ({
        ...row,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : index,
      }));

  const departmentsResult = await supabase
    .from("organization_departments")
    .select("id, name, description, is_active, created_at, sort_order")
    .eq("organization_id", tenant.organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(40);

  const departmentsData: DepartmentRow[] = hasMissingColumnError(departmentsResult.error, "sort_order")
    ? (
        await supabase
          .from("organization_departments")
          .select("id, name, description, is_active, created_at")
          .eq("organization_id", tenant.organizationId)
          .order("created_at", { ascending: false })
          .limit(40)
      ).data?.map((row, index) => ({ ...row, sort_order: index })) ?? []
    : (departmentsResult.data ?? []).map((row, index) => ({
        ...row,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : index,
      }));

  const positionsResult = await supabase
    .from("department_positions")
    .select("id, department_id, name, description, is_active, created_at, sort_order")
    .eq("organization_id", tenant.organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  const canManageGoogleOAuth = tenant.roleCode === "company_admin";
  const googleOAuthStatus = canManageGoogleOAuth
    ? await getTenantGoogleOAuthStatus(tenant.organizationId)
    : null;
  const activeCustomDomain = (customDomains ?? []).find((row) => row.status === "active" && row.is_primary)
    ?? (customDomains ?? []).find((row) => row.status === "active");
  const googleCallbackUrls = activeCustomDomain
    ? [`https://${activeCustomDomain.domain}/api/auth/google/tenant/callback`]
    : [];
  const googleOAuthDisabledReason = !customBrandingEnabled
    ? undefined
    : !activeCustomDomain
      ? "Primero activa el dominio personalizado de la empresa."
      : requestHost !== activeCustomDomain.domain
        ? `Abre estos ajustes desde https://${activeCustomDomain.domain}/app/settings para guardar y probar Google.`
        : undefined;

  const positionsData: PositionRow[] = hasMissingColumnError(positionsResult.error, "sort_order")
    ? (
        await supabase
          .from("department_positions")
          .select("id, department_id, name, description, is_active, created_at")
          .eq("organization_id", tenant.organizationId)
          .order("created_at", { ascending: false })
          .limit(200)
      ).data?.map((row, index) => ({ ...row, sort_order: index })) ?? []
    : (positionsResult.data ?? []).map((row, index) => ({
        ...row,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : index,
      }));

  const activeBranches = branchesData.filter((row) => row.is_active).length;
  const activeDepartments = departmentsData.filter((row) => row.is_active).length;
  const activePositions = positionsData.filter((row) => row.is_active).length;

  const positionsByDepartment: Record<string, PositionRow[]> = {};
  for (const position of positionsData) {
    const list = positionsByDepartment[position.department_id] ?? [];
    list.push(position);
    positionsByDepartment[position.department_id] = list;
  }

  return (
    <PageContent className="flex flex-col gap-5">
      <section className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 ${TEXT_STRONG}`}>
          <Settings2 className="h-4 w-4" />
          <h1 className="text-lg font-bold">{t("Ajustes de Empresa")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Header buttons removed; actions are now closely placed inline to their respective sections */}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className={`rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>{t("Empresa")}</p><p className={`mt-1 truncate text-lg font-bold ${TEXT_STRONG}`}>{organization?.name ?? t("Empresa")}</p></article>
        <article className={`rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>{t("Locaciones activas")}</p><p className={`mt-1 text-lg font-bold ${TEXT_STRONG}`}>{activeBranches}</p></article>
        <article className={`rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>{t("Departamentos activos")}</p><p className={`mt-1 text-lg font-bold ${TEXT_STRONG}`}>{activeDepartments}</p></article>
        <article className={`rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>{t("Puestos activos")}</p><p className={`mt-1 text-lg font-bold ${TEXT_STRONG}`}>{activePositions}</p></article>
      </section>

      {params.message ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            params.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {params.message}
        </section>
      ) : null}

      {params.status === "success" && params.message ? (
        <div className="fixed bottom-5 right-5 z-[1300] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 shadow-[0_10px_30px_rgba(16,185,129,.18)]">
          {params.message}
        </div>
      ) : null}

      <section className="grid gap-4">
        <CompanyContactSettingsCard
          locale={locale}
          organizationName={organization?.name ?? t("Empresa")}
          contactName={orgSettings?.contact_name ?? ""}
          supportEmail={orgSettings?.support_email ?? ""}
          supportPhone={orgSettings?.support_phone ?? ""}
          address={orgSettings?.address ?? ""}
          feedbackWhatsapp={orgSettings?.feedback_whatsapp ?? ""}
          websiteUrl={orgSettings?.website_url ?? ""}
          companyLogoUrl={brandingSettings?.company_logo_url ?? ""}
          companyLogoDarkUrl={brandingSettings?.company_logo_dark_url ?? ""}
          companyFaviconUrl={brandingSettings?.company_favicon_url ?? ""}
          customBrandingEnabled={customBrandingEnabled}
        />
        <CustomDomainSettingsCard
          locale={locale}
          enabled={customBrandingEnabled}
          initialRows={(customDomains ?? []).map((row) => ({
            ...row,
            statusLabel:
              row.status === "active"
                ? t("Activo")
                : row.status === "verifying_ssl"
                  ? t("Verificando SSL")
                  : row.status === "error"
                    ? t("Error")
                    : row.status === "disabled"
                      ? t("Deshabilitado")
                      : t("Pendiente DNS"),
          }))}
          defaultCnameTarget={DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET}
        />
        {googleOAuthStatus ? (
          <GoogleOAuthSettingsCard
            enabled={customBrandingEnabled}
            initialStatus={googleOAuthStatus}
          callbackUrls={googleCallbackUrls}
          disabledReason={googleOAuthDisabledReason}
          continueUrl={activeCustomDomain && requestHost !== activeCustomDomain.domain
            ? `https://${activeCustomDomain.domain}/app/settings#google-oauth-branding`
            : undefined}
          result={params.google_oauth}
            resultMessage={params.message}
          />
        ) : null}
      </section>

      <section id="org-structure" className="grid gap-4 xl:grid-cols-2">
        <article className={`rounded-2xl border p-5 ${CARD}`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className={`inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.1em] uppercase ${TEXT_MUTED}`}>
                <MapPin className="h-3.5 w-3.5" /> {t("Cobertura Geográfica")}
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--gbp-text)]">{t("Locaciones")}</h2>
            </div>
            <InlineBranchForm locale={locale} createAction={createBranchAction} />
          </div>

          <div className="space-y-3">
            <BranchList
              locale={locale}
              initialBranches={branchesData}
              updateAction={updateBranchAction}
              deleteAction={deleteBranchAction}
              toggleStatusAction={toggleBranchStatusAction}
            />
          </div>
        </article>

        <article className={`rounded-2xl border p-5 ${CARD}`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className={`inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.1em] uppercase ${TEXT_MUTED}`}>
                <Building2 className="h-3.5 w-3.5" /> {t("Estructura Organizacional")}
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--gbp-text)]">{t("Departamentos y Puestos")}</h2>
            </div>
            <InlineDepartmentForm locale={locale} createAction={createDepartmentAction} />
          </div>

          <div className="space-y-3">
            <ReorderableDepartmentList
              locale={locale}
              initialDepartments={departmentsData}
              positionsByDepartment={positionsByDepartment}
              updateDepartmentAction={updateDepartmentAction}
              deleteDepartmentAction={deleteDepartmentAction}
              toggleDepartmentStatusAction={toggleDepartmentStatusAction}
              createPositionAction={createDepartmentPositionAction}
              updatePositionAction={updateDepartmentPositionAction}
              deletePositionAction={deleteDepartmentPositionAction}
              togglePositionStatusAction={toggleDepartmentPositionStatusAction}
            />
          </div>
        </article>
      </section>

    </PageContent>
  );
}
