import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  Eye,
  LayoutGrid,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createOrganizationAction,
  deleteOrganizationAction,
  toggleOrganizationModuleAction,
  updateOrganizationAction,
} from "@/modules/organizations/actions";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";

type SuperadminOrganizationsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; org?: string }>;
};

async function getAuthUserMap() {
  const supabase = createSupabaseAdminClient();
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) break;

    for (const user of data.users) {
      map.set(user.id, user.email ?? user.id);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return map;
}

function statusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function modalRoute() {
  return "/superadmin/organizations";
}

function usagePercent(used: number, limit: number | null | undefined) {
  if (limit == null || limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

export default async function SuperadminOrganizationsPage({ searchParams }: SuperadminOrganizationsPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : "";
  const orgId = typeof params.org === "string" ? params.org : "";

  const [
    { data: organizations },
    { data: plans },
    { data: modules },
    { data: orgModules },
    { data: limits },
    { data: roles },
    { data: branchesUsage },
    { data: membershipsUsage },
    { data: employeesUsage },
    { data: storageUsage },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status, plan_id, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("plans")
      .select("id, name, code, is_active, price_amount, currency_code, billing_period")
      .order("name"),
    supabase.from("module_catalog").select("id, code, name, is_core").order("name"),
    supabase.from("organization_modules").select("organization_id, module_id, is_enabled"),
    supabase
      .from("organization_limits")
      .select("organization_id, max_branches, max_users, max_storage_mb, max_employees"),
    supabase.from("roles").select("id, code"),
    supabase.from("branches").select("organization_id, is_active"),
    supabase.from("memberships").select("organization_id, status"),
    supabase.from("employees").select("organization_id, is_active"),
    supabase.from("documents").select("organization_id, file_size_bytes"),
  ]);

  const companyAdminRoleId = roles?.find((role) => role.code === "company_admin")?.id;

  const { data: adminMemberships } = companyAdminRoleId
    ? await supabase
        .from("memberships")
        .select("organization_id, user_id")
        .eq("role_id", companyAdminRoleId)
        .eq("status", "active")
    : { data: [] };

  const authUserMap = await getAuthUserMap();
  const adminCountByOrg = new Map<string, number>();
  const adminEmailsByOrg = new Map<string, string[]>();
  for (const row of adminMemberships ?? []) {
    adminCountByOrg.set(row.organization_id, (adminCountByOrg.get(row.organization_id) ?? 0) + 1);
    const existing = adminEmailsByOrg.get(row.organization_id) ?? [];
    const email = authUserMap.get(row.user_id) ?? row.user_id;
    existing.push(email);
    adminEmailsByOrg.set(row.organization_id, existing);
  }

  const moduleMap = new Map<string, boolean>();
  for (const row of orgModules ?? []) {
    moduleMap.set(`${row.organization_id}:${row.module_id}`, row.is_enabled);
  }

  const limitsMap = new Map((limits ?? []).map((row) => [row.organization_id, row]));
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));

  const usedBranchesByOrg = new Map<string, number>();
  for (const row of branchesUsage ?? []) {
    if (!row.is_active) continue;
    usedBranchesByOrg.set(row.organization_id, (usedBranchesByOrg.get(row.organization_id) ?? 0) + 1);
  }

  const usedUsersByOrg = new Map<string, number>();
  for (const row of membershipsUsage ?? []) {
    if (row.status !== "active") continue;
    usedUsersByOrg.set(row.organization_id, (usedUsersByOrg.get(row.organization_id) ?? 0) + 1);
  }

  const usedEmployeesByOrg = new Map<string, number>();
  for (const row of employeesUsage ?? []) {
    if (!row.is_active) continue;
    usedEmployeesByOrg.set(row.organization_id, (usedEmployeesByOrg.get(row.organization_id) ?? 0) + 1);
  }

  const usedStorageMbByOrg = new Map<string, number>();
  for (const row of storageUsage ?? []) {
    const mb = Math.max(0, (row.file_size_bytes ?? 0) / (1024 * 1024));
    usedStorageMbByOrg.set(row.organization_id, (usedStorageMbByOrg.get(row.organization_id) ?? 0) + mb);
  }

  const totalOrgs = organizations?.length ?? 0;
  const activeOrgs = (organizations ?? []).filter((o) => o.status === "active").length;
  const pausedOrSuspended = (organizations ?? []).filter((o) => o.status !== "active").length;

  const selectedOrg = orgId ? (organizations ?? []).find((org) => org.id === orgId) ?? null : null;
  const selectedLimit = selectedOrg ? limitsMap.get(selectedOrg.id) : null;
  const selectedAdmins = selectedOrg ? adminEmailsByOrg.get(selectedOrg.id) ?? [] : [];
  const selectedEnabledModules = selectedOrg
    ? (modules ?? []).filter((mod) => moduleMap.get(`${selectedOrg.id}:${mod.id}`))
    : [];
  const selectedUsage = selectedOrg
    ? {
        branches: usedBranchesByOrg.get(selectedOrg.id) ?? 0,
        users: usedUsersByOrg.get(selectedOrg.id) ?? 0,
        employees: usedEmployeesByOrg.get(selectedOrg.id) ?? 0,
        storageMb: Math.round((usedStorageMbByOrg.get(selectedOrg.id) ?? 0) * 10) / 10,
      }
    : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-8">
      <section className="rounded-3xl border border-[#2d2622] bg-[#171311] px-6 py-6 text-white">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b8aaa2]">Superadmin</p>
        <h1 className="mb-1 font-serif text-[31px] leading-none">Organizaciones</h1>
        <p className="text-sm text-[#c7bbb3]">Gestion centralizada de empresa, plan, limites y modulos habilitados.</p>
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

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-[#e5ddd8] bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8d847f]"><Building2 className="h-3.5 w-3.5" />Organizaciones</p>
          <p className="mt-1 font-serif text-3xl text-[#251f1b]">{totalOrgs}</p>
        </article>
        <article className="rounded-2xl border border-[#d7eedf] bg-[#f4fbf6] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#5a7c65]"><BadgeCheck className="h-3.5 w-3.5" />Activas</p>
          <p className="mt-1 font-serif text-3xl text-[#1f6b3a]">{activeOrgs}</p>
        </article>
        <article className="rounded-2xl border border-[#f2d6d0] bg-[#fff7f5] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#9b564a]"><Settings2 className="h-3.5 w-3.5" />Pausadas/Suspendidas</p>
          <p className="mt-1 font-serif text-3xl text-[#b63a2f]">{pausedOrSuspended}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-[#e5ddd8] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,.04)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[#2f2925]">Listado de empresas</p>
          <Link href="/superadmin/organizations?action=create" className="inline-flex items-center gap-1.5 rounded-lg bg-[#b63a2f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#8f2e26]">
            <Plus className="h-4 w-4" /> Agregar
          </Link>
        </div>

        <div className="space-y-2">
          {(organizations ?? []).map((org) => {
            const selectedPlan = org.plan_id ? planById.get(org.plan_id) : null;
            const enabledCount = (modules ?? []).filter((m) => moduleMap.get(`${org.id}:${m.id}`)).length;
            const adminCount = adminCountByOrg.get(org.id) ?? 0;
            return (
              <article key={org.id} className="grid items-center gap-3 rounded-xl border border-[#eee6e1] bg-[#fffdfa] px-4 py-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#2a2420]">{org.name}</p>
                  <p className="truncate text-xs text-[#837a75]">{org.slug}</p>
                </div>
                <p className="text-xs text-[#5f5752]"><span className="font-semibold">Plan:</span> {selectedPlan ? selectedPlan.name : "Sin plan"}</p>
                <p className="text-xs text-[#5f5752]"><span className="font-semibold">Modulos:</span> {enabledCount}</p>
                <div>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(org.status)}`}>{org.status}</span>
                  <p className="mt-1 text-[11px] text-[#8a817b]">{adminCount} admin(s)</p>
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/superadmin/organizations?action=view&org=${org.id}`} title="Ver" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dfe6f1] bg-[#eff4ff] text-[#3f5f9a] hover:bg-[#e6eeff]"><Eye className="h-4 w-4" /></Link>
                  <Link href={`/superadmin/organizations?action=edit&org=${org.id}`} title="Editar" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#f0d5d0] bg-[#fff5f3] text-[#b63a2f] hover:bg-[#ffece8]"><Pencil className="h-4 w-4" /></Link>
                  <Link href={`/superadmin/organizations?action=delete&org=${org.id}`} title="Eliminar" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#f2d7d2] bg-[#fff4f2] text-[#b23a2d] hover:bg-[#ffe9e5]"><Trash2 className="h-4 w-4" /></Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {action === "create" ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <Link href={modalRoute()} className="absolute inset-0" aria-label="Cerrar" />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[#e5ddd8] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-[#2f2925]">Agregar organizacion</p>
              <Link href={modalRoute()} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5ddd8] text-[#7a716b] hover:bg-[#f7f2ef]"><X className="h-4 w-4" /></Link>
            </div>
            <form action={createOrganizationAction} autoComplete="off" className="grid gap-3 sm:grid-cols-2">
              <SuperadminInputField label="Empresa" name="name" required placeholder="Nombre comercial" className="sm:col-span-2" />
              <SuperadminSelectField label="Plan" name="plan_id" defaultValue="" className="sm:col-span-2">
                  <option value="">Sin plan</option>
                  {(plans ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>
                  ))}
              </SuperadminSelectField>
              <SuperadminInputField label="Nombre admin" name="admin_full_name" required placeholder="Nombre y apellido" className="sm:col-span-2" />
              <SuperadminInputField label="Email admin" name="admin_email" type="email" autoComplete="off" required placeholder="admin@empresa.com" />
              <SuperadminInputField label="Contrasena admin" name="admin_password" type="password" autoComplete="new-password" required minLength={8} placeholder="Min. 8 caracteres" />
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Link href={modalRoute()} className="rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#635b56] hover:bg-[#f6f1ef]">Cancelar</Link>
                <button type="submit" className="rounded-lg bg-[#b63a2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26]">Crear empresa</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {action === "view" && selectedOrg ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <Link href={modalRoute()} className="absolute inset-0" aria-label="Cerrar" />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[#e5ddd8] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-[#2f2925]">Ver organizacion</p>
              <Link href={modalRoute()} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5ddd8] text-[#7a716b] hover:bg-[#f7f2ef]"><X className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3"><p className="text-xs text-[#8b817b]">Nombre</p><p className="font-semibold text-[#2f2925]">{selectedOrg.name}</p></div>
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3"><p className="text-xs text-[#8b817b]">Admin de empresa</p><p className="font-semibold text-[#2f2925]">{selectedAdmins[0] ?? "Sin admin"}</p></div>
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3"><p className="text-xs text-[#8b817b]">Estado</p><p className="font-semibold text-[#2f2925]">{selectedOrg.status}</p></div>
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3"><p className="text-xs text-[#8b817b]">Plan</p><p className="font-semibold text-[#2f2925]">{selectedOrg.plan_id ? planById.get(selectedOrg.plan_id)?.name ?? "-" : "Sin plan"}</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3">
                <p className="mb-2 text-xs text-[#8b817b]">Limites y consumo real</p>
                <div className="space-y-2 text-xs text-[#5f5752]">
                  {[
                    { label: "Sucursales", used: selectedUsage?.branches ?? 0, limit: selectedLimit?.max_branches ?? null },
                    { label: "Usuarios", used: selectedUsage?.users ?? 0, limit: selectedLimit?.max_users ?? null },
                    { label: "Empleados", used: selectedUsage?.employees ?? 0, limit: selectedLimit?.max_employees ?? null },
                    { label: "Storage MB", used: selectedUsage?.storageMb ?? 0, limit: selectedLimit?.max_storage_mb ?? null },
                  ].map((row) => {
                    const pct = usagePercent(Number(row.used), row.limit);
                    return (
                      <div key={row.label}>
                        <div className="mb-1 flex items-center justify-between">
                          <span>{row.label}</span>
                          <span className="font-semibold text-[#2f2925]">{row.used}/{row.limit ?? "Sin limite"}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#efe8e4]">
                          <div
                            className={`h-full rounded-full ${pct == null ? "bg-[#b6aca7]" : pct >= 90 ? "bg-[#c0392b]" : pct >= 75 ? "bg-[#d97706]" : "bg-[#2f6f44]"}`}
                            style={{ width: `${pct ?? 35}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-[#eee6e1] bg-[#fffdfa] p-3"><p className="text-xs text-[#8b817b]">Modulos habilitados ({selectedEnabledModules.length})</p><div className="mt-2 flex flex-wrap gap-1">{selectedEnabledModules.length ? selectedEnabledModules.map((mod) => <span key={mod.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{mod.name}</span>) : <span className="text-xs text-[#8b817b]">Sin modulos</span>}</div></div>
            </div>
          </div>
        </div>
      ) : null}

      {action === "edit" && selectedOrg ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <Link href={modalRoute()} className="absolute inset-0" aria-label="Cerrar" />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-[#e5ddd8] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-[#2f2925]">Editar organizacion</p>
              <Link href={modalRoute()} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5ddd8] text-[#7a716b] hover:bg-[#f7f2ef]"><X className="h-4 w-4" /></Link>
            </div>

            <div className="grid gap-4">
              <form action={updateOrganizationAction} className="rounded-xl border border-[#e8dfda] bg-[#fcfaf8] p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#342e2a]"><Settings2 className="h-4 w-4" /> Datos generales</h3>
                <input type="hidden" name="organization_id" value={selectedOrg.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <SuperadminInputField
                    label="Nombre"
                    name="name"
                    defaultValue={selectedOrg.name}
                    placeholder="Nombre comercial"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    className="sm:col-span-2"
                    labelBgClassName="bg-[#fcfaf8]"
                  />
                  <SuperadminSelectField label="Estado" name="status" defaultValue={selectedOrg.status} labelBgClassName="bg-[#fcfaf8]">
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="suspended">suspended</option>
                  </SuperadminSelectField>
                  <SuperadminSelectField label="Plan" name="plan_id" defaultValue={selectedOrg.plan_id ?? ""} labelBgClassName="bg-[#fcfaf8]">
                      <option value="">Sin plan</option>
                      {(plans ?? []).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>)}
                  </SuperadminSelectField>
                </div>
                <button type="submit" className="mt-3 rounded-lg border border-[#ddd3ce] bg-white px-3 py-1.5 text-sm font-medium text-[#564f4a] hover:bg-[#f6f1ef]">Guardar datos</button>
                <p className="mt-2 text-xs text-[#7f756f]">Si cambias el plan, se sincronizan automaticamente los limites de la organizacion con ese plan.</p>
              </form>
            </div>

            <div className="mt-4 rounded-xl border border-[#e8dfda] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#342e2a]"><LayoutGrid className="h-4 w-4" /> Modulos habilitados</h3>
              <div className="flex flex-wrap gap-2">
                {(modules ?? []).map((module) => {
                  const isEnabled = moduleMap.get(`${selectedOrg.id}:${module.id}`) ?? false;
                  const isCoreLocked = module.is_core;
                  return (
                    <form key={module.id} action={toggleOrganizationModuleAction}>
                      <input type="hidden" name="organization_id" value={selectedOrg.id} />
                      <input type="hidden" name="module_id" value={module.id} />
                      <input type="hidden" name="next_enabled" value={String(isCoreLocked ? true : !isEnabled)} />
                      <button
                        type="submit"
                        disabled={isCoreLocked}
                        title={isCoreLocked ? "Modulo core no desactivable" : undefined}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          isEnabled
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-neutral-50 text-neutral-500"
                        } ${isCoreLocked ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        {module.name}
                        {module.is_core ? " (core)" : ""}
                      </button>
                    </form>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e8dfda] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#342e2a]"><User className="h-4 w-4" /> Admin de empresa</h3>
              <p className="text-sm text-[#4f4843]">{selectedAdmins[0] ?? "Sin admin"}</p>
              <p className="mt-1 text-xs text-[#8a807a]">El admin se define en el alta de la organizacion.</p>
            </div>
          </div>
        </div>
      ) : null}

      {action === "delete" && selectedOrg ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <Link href={modalRoute()} className="absolute inset-0" aria-label="Cerrar" />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-[#f0d5d0] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-[#2f2925]">Eliminar organizacion</p>
              <Link href={modalRoute()} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5ddd8] text-[#7a716b] hover:bg-[#f7f2ef]"><X className="h-4 w-4" /></Link>
            </div>

            <div className="rounded-xl border border-[#f3d5cf] bg-[#fff6f4] p-3 text-sm text-[#7a3a32]">
              Esta accion eliminara la empresa y todos sus datos relacionados (sucursales, empleados, documentos, checklists, anuncios, auditoria y configuraciones).
            </div>

            <p className="mt-3 text-sm text-[#4f4843]">
              Para confirmar, escribe el slug exacto: <span className="font-semibold">{selectedOrg.slug}</span>
            </p>

            <form action={deleteOrganizationAction} className="mt-3 space-y-3">
              <input type="hidden" name="organization_id" value={selectedOrg.id} />
              <SuperadminInputField
                label="Slug de confirmacion"
                name="confirm_slug"
                required
                placeholder={selectedOrg.slug}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <div className="flex justify-end gap-2">
                <Link href={modalRoute()} className="rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#635b56] hover:bg-[#f6f1ef]">Cancelar</Link>
                <button type="submit" className="rounded-lg bg-[#b63a2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26]">
                  Eliminar empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
