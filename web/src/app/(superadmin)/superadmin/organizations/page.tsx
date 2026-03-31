import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleOff,
  Eye,
  LayoutGrid,
  LogIn,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import * as motion from "framer-motion/client";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createOrganizationAction,
  deleteOrganizationAction,
  startOrganizationImpersonationAction,
  toggleOrganizationModuleAction,
  updateOrganizationAction,
} from "@/modules/organizations/actions";
import { ResendInvitationButton } from "@/modules/organizations/ui/resend-invitation-button";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";
import { SubmitButton } from "@/shared/ui/submit-button";

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
    supabase.from("employees").select("organization_id, status"),
    supabase.from("documents").select("organization_id, file_size_bytes")
.is('deleted_at', null),
  ]);

  const companyAdminRoleId = roles?.find((role) => role.code === "company_admin")?.id;

  const { data: adminMemberships } = companyAdminRoleId
    ? await supabase
        .from("memberships")
        .select("organization_id, user_id, status")
        .eq("role_id", companyAdminRoleId)
        .in("status", ["active", "invited"])
    : { data: [] };

  const authUserMap = await getAuthUserMap();
  const adminCountByOrg = new Map<string, number>();
  const adminEmailsByOrg = new Map<string, Array<{ email: string; status: string }>>();
  for (const row of adminMemberships ?? []) {
    adminCountByOrg.set(row.organization_id, (adminCountByOrg.get(row.organization_id) ?? 0) + 1);
    const existing = adminEmailsByOrg.get(row.organization_id) ?? [];
    const email = authUserMap.get(row.user_id) ?? row.user_id;
    existing.push({ email, status: row.status });
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
    if (row.status !== "active") continue;
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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-light/60">Superadmin Control</p>
          <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Organizaciones</h1>
          <p className="mt-4 max-w-2xl text-base text-white/70 leading-relaxed">
            Gestión centralizada de infraestructura multi-tenant. Administra planes, límites y capacidades para cada empresa en la plataforma.
          </p>
        </div>
      </section>

      {params.message && (
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-[1.25rem] border px-6 py-4 text-sm font-medium shadow-sm ${
            params.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {params.message}
        </motion.section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Empresas", val: totalOrgs, icon: Building2, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]" },
          { label: "Operacionales", val: activeOrgs, icon: BadgeCheck, color: "text-emerald-700", bg: "bg-emerald-50/50" },
          { label: "Pausas / Alertas", val: pausedOrSuspended, icon: Settings2, color: "text-red-700", bg: "bg-red-50/50" },
        ].map((stat, idx) => (
          <motion.article 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`rounded-3xl border border-[var(--gbp-border)] ${stat.bg} p-5 shadow-sm`}
          >
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" /> {stat.label}
            </p>
            <p className={`mt-2 font-serif text-3xl font-medium ${stat.color}`}>{stat.val}</p>
          </motion.article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Directorio Organizado</h2>
            <div className="flex items-center gap-2 rounded-xl bg-[var(--gbp-bg)] px-3 py-1.5 border border-[var(--gbp-border)]">
               <Search className="h-3.5 w-3.5 text-muted-foreground" />
               <input type="text" placeholder="Buscar..." className="bg-transparent text-xs outline-none w-24 placeholder:text-muted-foreground/60" />
            </div>
          </div>
           <Link href="/superadmin/organizations?action=create" className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-5 py-2.5 text-xs font-bold text-white shadow-[var(--gbp-shadow-accent)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:scale-[1.02] active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Nueva Organización
          </Link>
        </div>

        <div className="space-y-3">
          {(organizations ?? []).map((org) => {
            const selectedPlan = org.plan_id ? planById.get(org.plan_id) : null;
            const enabledCount = (modules ?? []).filter((m) => moduleMap.get(`${org.id}:${m.id}`)).length;
            const adminCount = adminCountByOrg.get(org.id) ?? 0;
            return (
              <motion.article 
                key={org.id} 
                className="group relative grid items-center gap-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-4 transition-all hover:bg-[var(--gbp-surface)] hover:shadow-xl hover:shadow-black/5 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{org.name}</p>
                  <p className="truncate text-[11px] font-medium tracking-wide uppercase text-muted-foreground/60">{org.slug}</p>
                </div>
                <div>
                   <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Plan contratado</p>
                   <p className="text-sm font-bold text-foreground/80">{selectedPlan ? selectedPlan.name : "Sin plan"}</p>
                </div>
                <div>
                   <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Módulos</p>
                   <p className="text-sm font-bold text-foreground/80">{enabledCount} <span className="text-[10px] font-normal opacity-60">activos</span></p>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-tighter ${statusTone(org.status)}`}>
                    {org.status}
                  </span>
                  <p className="text-[11px] font-medium text-muted-foreground/60">{adminCount} administrador(es)</p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={startOrganizationImpersonationAction}>
                    <input type="hidden" name="organization_id" value={org.id} />
                    <input type="hidden" name="organization_name" value={org.name} />
                    <input type="hidden" name="reason" value="superadmin_table_quick_access" />
                    <button type="submit" title="Ingresar a la organización" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 hover:scale-105"><LogIn className="h-4 w-4" /></button>
                  </form>
                  <Link href={`/superadmin/organizations?action=view&org=${org.id}`} title="Ver" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 hover:scale-105"><Eye className="h-4 w-4" /></Link>
                  <Link href={`/superadmin/organizations?action=edit&org=${org.id}`} title="Editar" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 hover:scale-105"><Pencil className="h-4 w-4" /></Link>
                  <Link href={`/superadmin/organizations?action=delete&org=${org.id}`} title="Eliminar" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 hover:scale-105"><Trash2 className="h-4 w-4" /></Link>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* Modals with premium styling */}
      <AnimatePresence>
        {action && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          >
            <Link href="/superadmin/organizations" className="absolute inset-0 cursor-default" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative z-10 w-full rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 shadow-2xl ${action === 'edit' ? 'max-w-4xl' : action === 'create' ? 'max-w-3xl' : 'max-w-2xl'}`}
            >
              <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
                <div>
                   <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">Operación Superadmin</p>
                   <h3 className="text-2xl font-bold tracking-tight text-foreground">
                    {action === 'create' && 'Registrar Nueva Organización'}
                    {action === 'view' && 'Detalles de la Organización'}
                    {action === 'edit' && 'Gestión de Capacidades'}
                    {action === 'delete' && 'Protocolo de Eliminación'}
                   </h3>
                </div>
                  <Link href="/superadmin/organizations" className="group rounded-full bg-[var(--gbp-surface2)] p-2 text-[var(--gbp-text2)] transition-all hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]">
                  <X className="h-5 w-5 transition-transform group-hover:rotate-90" />
                </Link>
              </div>

              {params.message ? (
                <div
                  className={`mb-5 rounded-xl border px-4 py-3 text-xs font-semibold ${
                    params.status === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {params.message}
                </div>
              ) : null}

              {action === "create" && (
                <form action={createOrganizationAction} autoComplete="off" className="space-y-6">
                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5">
                    <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Datos de la organización</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <SuperadminInputField label="Organización" name="name" required placeholder="Nombre comercial de la empresa" className="md:col-span-2" />
                      <SuperadminSelectField label="Plan Inicial" name="plan_id" defaultValue="" className="md:col-span-2">
                          <option value="">Sin plan asignado</option>
                          {(plans ?? []).map((plan) => (
                            <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>
                          ))}
                      </SuperadminSelectField>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
                    <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-brand">Credenciales del Administrador</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <SuperadminInputField label="Nombre Completo" name="admin_full_name" required placeholder="Nombre del responsable" className="md:col-span-2" />
                      <SuperadminInputField label="Email Corporativo" name="admin_email" type="email" autoComplete="off" required placeholder="admin@empresa.com" />
                      <SuperadminInputField label="Contraseña" name="admin_password" type="password" autoComplete="new-password" required minLength={8} placeholder="••••••••" />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Se creará la cuenta del administrador con esta contraseña, se enviará por email y se solicitará cambio obligatorio en el primer ingreso.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3 pt-1">
                     <Link href="/superadmin/organizations" className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)] transition-all hover:bg-[var(--gbp-bg)]">Cancelar</Link>
                    <SubmitButton
                      label="Crear y enviar invitación"
                      pendingLabel="Creando organización y enviando..."
                      variant="primary"
                      className="rounded-xl px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/20"
                    />
                  </div>
                </form>
              )}

              {action === "view" && selectedOrg && (
                <div className="space-y-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-line/40 bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Razón Social</p>
                      <p className="text-lg font-bold text-foreground">{selectedOrg.name}</p>
                    </div>
                    <div className="rounded-2xl border border-line/40 bg-muted/20 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Administrador</p>
                      <p className="text-lg font-bold text-foreground truncate">{selectedAdmins[0]?.email ?? "- No asignado -"}</p>
                      {selectedAdmins[0]?.status ? (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          Estado: {selectedAdmins[0].status === "invited" ? "Invitado" : "Activo"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-brand mb-4">Métricas de Consumo y Límites</h4>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-4 rounded-2xl border border-line/40 p-6">
                        {[
                          { label: "Sucursales", used: selectedUsage?.branches ?? 0, limit: selectedLimit?.max_branches ?? null },
                          { label: "Usuarios", used: selectedUsage?.users ?? 0, limit: selectedLimit?.max_users ?? null },
                          { label: "Colaboradores", used: selectedUsage?.employees ?? 0, limit: selectedLimit?.max_employees ?? null },
                          { label: "Almacenamiento (MB)", used: selectedUsage?.storageMb ?? 0, limit: selectedLimit?.max_storage_mb ?? null },
                        ].map((row) => {
                          const pct = usagePercent(Number(row.used), row.limit);
                          return (
                            <div key={row.label}>
                              <div className="mb-2 flex items-baseline justify-between">
                                <span className="text-sm font-medium text-muted-foreground">{row.label}</span>
                                <span className="text-sm font-bold text-foreground">{row.used}<span className="text-muted-foreground/60 font-normal"> / {row.limit ?? "∞"}</span></span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct ?? 35}%` }}
                                  className={`h-full rounded-full ${pct == null ? "bg-muted-foreground/30" : pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="rounded-2xl border border-line/40 bg-muted/10 p-6">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-4">Capacidades Habilitadas</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedEnabledModules.length > 0 ? (
                            selectedEnabledModules.map((mod) => (
                              <span key={mod.id} className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                                <BadgeCheck className="h-3.5 w-3.5" /> {mod.name}
                              </span>
                            ))
                          ) : (
                            <div className="flex flex-col items-center justify-center py-6 w-full text-muted-foreground">
                               <CircleOff className="h-8 w-8 opacity-20 mb-2" />
                               <p className="text-xs italic">Sin módulos habilitados</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {action === "edit" && selectedOrg && (
                <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                  <div className="space-y-6">
                    <form action={updateOrganizationAction} className="flex flex-col rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
                      <h4 className="mb-6 flex items-center gap-2 text-sm font-bold text-foreground">
                        <Settings2 className="h-5 w-5 text-[var(--gbp-accent)]" /> Configuración General
                      </h4>
                      <input type="hidden" name="organization_id" value={selectedOrg.id} />
                      <div className="flex flex-col gap-8 pt-2">
                        <SuperadminInputField label="Nombre" name="name" defaultValue={selectedOrg.name} labelBgClassName="bg-[var(--gbp-surface)]" />
                        <div className="grid gap-8 sm:grid-cols-2">
                          <SuperadminSelectField label="Estado" name="status" defaultValue={selectedOrg.status} labelBgClassName="bg-[var(--gbp-surface)]">
                            <option value="active">Activo</option>
                            <option value="paused">Pausado</option>
                            <option value="suspended">Suspendido</option>
                          </SuperadminSelectField>
                          <SuperadminSelectField label="Plan de Servicio" name="plan_id" defaultValue={selectedOrg.plan_id ?? ""} labelBgClassName="bg-[var(--gbp-surface)]">
                            <option value="">Sin plan</option>
                            {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </SuperadminSelectField>
                        </div>
                      </div>
                      <SubmitButton
                        label="Actualizar Organización"
                        pendingLabel="Actualizando..."
                        variant="primary"
                        className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition-transform active:scale-[0.98]"
                      />
                    </form>
                    
                     <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6 shadow-sm">
                        <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                          <User className="h-5 w-5 text-[var(--gbp-accent)]" /> Responsable
                        </h4>
                        <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
                           <p className="text-sm font-bold text-foreground truncate">{selectedAdmins[0]?.email ?? "- No asignado -"}</p>
                           {selectedAdmins[0]?.status ? (
                             <p className="mt-1 text-[11px] font-semibold text-amber-600">
                               Estado: {selectedAdmins[0].status === "invited" ? "Invitado" : "Activo"}
                             </p>
                           ) : null}
                           <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">El administrador principal solo puede ser cambiado mediante consola de seguridad.</p>
                        </div>
                        {selectedAdmins[0] && selectedAdmins[0].status === "invited" && (
                          <div className="mt-4">
                            <ResendInvitationButton
                              organizationId={selectedOrg.id}
                              email={selectedAdmins[0].email}
                              fullName={selectedAdmins[0].email.split("@")[0]}
                            />
                          </div>
                        )}
                     </div>
                   </div>

                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm flex flex-col">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                      <LayoutGrid className="h-5 w-5 text-[var(--gbp-accent)]" /> Catálogo de Módulos
                    </h4>
                    <p className="mb-6 border-b border-[var(--gbp-border)] pb-4 text-xs leading-relaxed text-muted-foreground">
                      Habilite o deshabilite funcionalidades específicas para esta organización. Los módulos CORE son obligatorios.
                    </p>
                    <div className="flex-1 grid gap-4 content-start">
                      {(modules ?? []).map((module) => {
                        const isEnabled = moduleMap.get(`${selectedOrg.id}:${module.id}`) ?? false;
                        const isCoreLocked = module.is_core;
                        return (
                          <form key={module.id} action={toggleOrganizationModuleAction} className="flex items-center justify-between group rounded-lg transition-colors p-1.5 hover:bg-[var(--gbp-bg2)]">
                            <input type="hidden" name="organization_id" value={selectedOrg.id} />
                            <input type="hidden" name="module_id" value={module.id} />
                            <input type="hidden" name="next_enabled" value={String(isCoreLocked ? true : !isEnabled)} />
                            
                            <div className="flex flex-col">
                              <span className={`text-[13px] font-bold transition-colors ${isEnabled ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                                {module.name}
                                {module.is_core && <span className="ml-2 rounded border border-[var(--gbp-accent)]/20 bg-[var(--gbp-accent)]/10 px-1 py-0.5 text-[9px] uppercase tracking-widest text-[var(--gbp-accent)]">Core</span>}
                              </span>
                            </div>

                            <button
                              type="submit"
                              disabled={isCoreLocked}
                              className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--gbp-accent)] focus:ring-offset-2 focus:ring-offset-[var(--gbp-surface)] ${isCoreLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isEnabled ? 'bg-[var(--gbp-accent)] shadow-md shadow-brand/20' : 'bg-slate-300 dark:bg-slate-700'}`}
                            >
                               <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${isEnabled ? 'left-[24px]' : 'left-1'}`} />
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {action === "delete" && selectedOrg && (
                <div className="space-y-6">
                  <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-center shadow-inner">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600">
                       <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h4 className="text-xl font-bold text-red-900">Advertencia Crítica</h4>
                    <p className="mt-3 text-sm leading-relaxed text-red-800/80">
                      Esta operación es <span className="font-extrabold underline">irreversible</span> e impactará a todos los servicios asociados. Se eliminarán permanentemente bases de datos de sucursales, colaboradores, documentos históricos y configuraciones de seguridad.
                    </p>
                  </div>

                  <div className="p-6 bg-muted/20 rounded-[2rem] border border-line/20">
                    <p className="text-sm text-muted-foreground text-center mb-6">
                      Para proceder con la baja del tenant, ingrese el slug de confirmación:
                    </p>
                    <div className="max-w-xs mx-auto">
                        <div className="text-center mb-4">
                           <span className="inline-block rounded-xl bg-white px-4 py-1.5 text-lg font-mono font-black border border-line/40 shadow-sm">{selectedOrg.slug}</span>
                        </div>
                        <form action={deleteOrganizationAction} className="space-y-4">
                          <input type="hidden" name="organization_id" value={selectedOrg.id} />
                          <SuperadminInputField
                            label=""
                            name="confirm_slug"
                            required
                            placeholder="Ingrese el slug aquí"
                            className="text-center"
                          />
                          <button type="submit" className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-red-200 transition-all hover:bg-red-700 active:scale-[0.98]">
                            Confirmar Destrucción de Datos
                          </button>
                        </form>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
