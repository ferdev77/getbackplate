"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleOff,
  Eye,
  LayoutGrid,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import * as motion from "framer-motion/client";

import {
  createOrganizationAction,
  deleteOrganizationAction,
  startOrganizationImpersonationAction,
  toggleOrganizationModuleAction,
  updateOrganizationAction,
} from "@/modules/organizations/actions";
import { ImpersonationSubmitButton } from "@/modules/organizations/ui/impersonation-submit-button";
import { ResendInvitationButton } from "@/modules/organizations/ui/resend-invitation-button";
import { PageContent } from "@/shared/ui/page-content";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";
import { SubmitButton } from "@/shared/ui/submit-button";

type Props = {
  organizations: Array<{ id: string; name: string; slug: string; status: string; plan_id: string | null }>;
  plans: Array<{ id: string; name: string; code: string }>;
  modules: Array<{ id: string; code: string; name: string; is_core: boolean }>;
  orgModules: Array<{ organization_id: string; module_id: string; is_enabled: boolean }>;
  limits: Array<{ organization_id: string; max_branches: number | null; max_users: number | null; max_storage_mb: number | null; max_employees: number | null }>;
  branchesUsage: Array<{ organization_id: string; is_active: boolean }>;
  membershipsUsage: Array<{ organization_id: string; status: string }>;
  employeesUsage: Array<{ organization_id: string; status: string }>;
  storageUsage: Array<{ organization_id: string; file_size_bytes: number | null }>;
  adminEntries: Array<{ organization_id: string; email: string; status: string }>;
  initialAction?: string;
  initialOrgId?: string;
  statusMessage?: { status?: string; message?: string };
};

function statusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function usagePercent(used: number, limit: number | null | undefined) {
  if (limit == null || limit <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

export function SuperadminOrganizationsWorkspace({
  organizations,
  plans,
  modules,
  orgModules,
  limits,
  branchesUsage,
  membershipsUsage,
  employeesUsage,
  storageUsage,
  adminEntries,
  initialAction,
  initialOrgId,
  statusMessage,
}: Props) {
  const [modalAction, setModalAction] = useState<string>(initialAction ?? "");
  const [modalOrgId, setModalOrgId] = useState<string>(initialOrgId ?? "");

  const moduleMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of orgModules) {
      map.set(`${row.organization_id}:${row.module_id}`, row.is_enabled);
    }
    return map;
  }, [orgModules]);

  const limitsMap = useMemo(() => new Map(limits.map((row) => [row.organization_id, row])), [limits]);
  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const adminCountByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of adminEntries) map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + 1);
    return map;
  }, [adminEntries]);

  const adminsByOrg = useMemo(() => {
    const map = new Map<string, Array<{ email: string; status: string }>>();
    for (const row of adminEntries) {
      const existing = map.get(row.organization_id) ?? [];
      existing.push({ email: row.email, status: row.status });
      map.set(row.organization_id, existing);
    }
    return map;
  }, [adminEntries]);

  const usedBranchesByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of branchesUsage) {
      if (!row.is_active) continue;
      map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + 1);
    }
    return map;
  }, [branchesUsage]);

  const usedUsersByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of membershipsUsage) {
      if (row.status !== "active") continue;
      map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + 1);
    }
    return map;
  }, [membershipsUsage]);

  const usedEmployeesByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of employeesUsage) {
      if (row.status !== "active") continue;
      map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + 1);
    }
    return map;
  }, [employeesUsage]);

  const usedStorageMbByOrg = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of storageUsage) {
      const mb = Math.max(0, (row.file_size_bytes ?? 0) / (1024 * 1024));
      map.set(row.organization_id, (map.get(row.organization_id) ?? 0) + mb);
    }
    return map;
  }, [storageUsage]);

  const selectedOrg = modalOrgId ? organizations.find((org) => org.id === modalOrgId) ?? null : null;
  const selectedLimit = selectedOrg ? limitsMap.get(selectedOrg.id) : null;
  const selectedAdmins = selectedOrg ? adminsByOrg.get(selectedOrg.id) ?? [] : [];
  const selectedEnabledModules = selectedOrg ? modules.filter((mod) => moduleMap.get(`${selectedOrg.id}:${mod.id}`)) : [];
  const selectedUsage = selectedOrg
    ? {
        branches: usedBranchesByOrg.get(selectedOrg.id) ?? 0,
        users: usedUsersByOrg.get(selectedOrg.id) ?? 0,
        employees: usedEmployeesByOrg.get(selectedOrg.id) ?? 0,
        storageMb: Math.round((usedStorageMbByOrg.get(selectedOrg.id) ?? 0) * 10) / 10,
      }
    : null;

  const totalOrgs = organizations.length;
  const activeOrgs = organizations.filter((o) => o.status === "active").length;
  const pausedOrSuspended = organizations.filter((o) => o.status !== "active").length;

  const openModal = (action: string, orgId = "") => {
    setModalAction(action);
    setModalOrgId(orgId);
  };

  const closeModal = () => {
    setModalAction("");
    setModalOrgId("");
  };

  return (
    <PageContent spacing="roomy" className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="relative z-10">
          <p className="gbp-page-eyebrow mb-2 text-brand-light/60">Superadmin Control</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Organizaciones</h1>
        </div>
      </section>

      {statusMessage?.message ? (
        <section className={`rounded-[1.25rem] border px-6 py-4 text-sm font-medium shadow-sm ${statusMessage.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {statusMessage.message}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[{ label: "Total Empresas", val: totalOrgs, icon: Building2 }, { label: "Operacionales", val: activeOrgs, icon: BadgeCheck }, { label: "Pausas / Alertas", val: pausedOrSuspended, icon: Settings2 }].map((stat) => (
          <article key={stat.label} className="rounded-3xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em] text-muted-foreground"><stat.icon className="h-3.5 w-3.5" /> {stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{stat.val}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Directorio Organizado</h2>
          <button type="button" onClick={() => openModal("create")} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-5 py-2.5 text-xs font-bold text-white shadow-[var(--gbp-shadow-accent)]">
            <Plus className="h-4 w-4" /> Nueva Organización
          </button>
        </div>

        <div className="space-y-3">
          {organizations.map((org) => {
            const selectedPlan = org.plan_id ? planById.get(org.plan_id) : null;
            const enabledCount = modules.filter((m) => moduleMap.get(`${org.id}:${m.id}`)).length;
            const adminCount = adminCountByOrg.get(org.id) ?? 0;
            return (
              <article key={org.id} className="relative grid items-center gap-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-4 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{org.name}</p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/60">{org.slug}</p>
                </div>
                <div><p className="text-sm font-bold text-foreground/80">{selectedPlan ? selectedPlan.name : "Sin plan"}</p></div>
                <div><p className="text-sm font-bold text-foreground/80">{enabledCount} activos</p></div>
                <div className="flex flex-col items-start gap-1">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] ${statusTone(org.status)}`}>{org.status}</span>
                  <p className="text-[11px] font-semibold text-muted-foreground/60">{adminCount} administrador(es)</p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={startOrganizationImpersonationAction} className="relative group/tooltip inline-flex">
                    <input type="hidden" name="organization_id" value={org.id} />
                    <input type="hidden" name="organization_name" value={org.name} />
                    <input type="hidden" name="reason" value="superadmin_table_quick_access" />
                    <ImpersonationSubmitButton />
                  </form>
                  <button type="button" onClick={() => openModal("view", org.id)} className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600"><Eye className="h-4 w-4" /><TooltipLabel label="Ver" /></button>
                  <button type="button" onClick={() => openModal("edit", org.id)} className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600"><Pencil className="h-4 w-4" /><TooltipLabel label="Editar" /></button>
                  <button type="button" onClick={() => openModal("delete", org.id)} className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600"><Trash2 className="h-4 w-4" /><TooltipLabel label="Eliminar" /></button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {modalAction ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <button type="button" onClick={closeModal} className="absolute inset-0 cursor-default" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className={`relative z-10 w-full rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 shadow-2xl ${modalAction === "edit" ? "max-w-4xl" : modalAction === "create" ? "max-w-3xl" : "max-w-2xl"}`}>
              <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
                <h3 className="text-2xl font-bold tracking-tight text-foreground">
                  {modalAction === "create" && "Registrar Nueva Organización"}
                  {modalAction === "view" && "Detalles de la Organización"}
                  {modalAction === "edit" && "Gestión de Capacidades"}
                  {modalAction === "delete" && "Protocolo de Eliminación"}
                </h3>
                <button type="button" onClick={closeModal} className="group rounded-full bg-[var(--gbp-surface2)] p-2 text-[var(--gbp-text2)]"><X className="h-5 w-5" /></button>
              </div>

              {modalAction === "create" ? (
                <form action={createOrganizationAction} autoComplete="off" className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <SuperadminInputField label="Organización" name="name" required className="md:col-span-2" />
                    <SuperadminSelectField label="Plan Inicial" name="plan_id" defaultValue="" className="md:col-span-2">
                      <option value="">Sin plan asignado</option>
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>)}
                    </SuperadminSelectField>
                    <SuperadminInputField label="Nombre Completo" name="admin_full_name" required className="md:col-span-2" />
                    <SuperadminInputField label="Email Corporativo" name="admin_email" type="email" required />
                    <SuperadminInputField label="Contraseña" name="admin_password" type="password" required minLength={8} />
                  </div>
                  <div className="flex justify-end gap-3"><SubmitButton label="Crear y enviar invitación" pendingLabel="Creando..." variant="primary" className="rounded-xl px-8 py-2.5 text-sm font-bold text-white" /></div>
                </form>
              ) : null}

              {modalAction === "view" && selectedOrg ? (
                <div className="space-y-6">
                  <p className="text-lg font-bold text-foreground">{selectedOrg.name}</p>
                  <p className="text-sm text-[var(--gbp-text2)]">Administrador: {selectedAdmins[0]?.email ?? "- No asignado -"}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[{ label: "Locaciones", used: selectedUsage?.branches ?? 0, limit: selectedLimit?.max_branches ?? null }, { label: "Usuarios", used: selectedUsage?.users ?? 0, limit: selectedLimit?.max_users ?? null }, { label: "Colaboradores", used: selectedUsage?.employees ?? 0, limit: selectedLimit?.max_employees ?? null }, { label: "Almacenamiento (MB)", used: selectedUsage?.storageMb ?? 0, limit: selectedLimit?.max_storage_mb ?? null }].map((row) => {
                      const pct = usagePercent(Number(row.used), row.limit);
                      return <p key={row.label} className="text-sm text-[var(--gbp-text2)]">{row.label}: {row.used} / {row.limit ?? "∞"} ({pct ?? 0}%)</p>;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEnabledModules.length ? selectedEnabledModules.map((mod) => <span key={mod.id} className="rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{mod.name}</span>) : <div className="flex items-center gap-2 text-[var(--gbp-text2)]"><CircleOff className="h-4 w-4" />Sin módulos habilitados</div>}
                  </div>
                </div>
              ) : null}

              {modalAction === "edit" && selectedOrg ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                  <form action={updateOrganizationAction} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
                    <input type="hidden" name="organization_id" value={selectedOrg.id} />
                    <SuperadminInputField label="Nombre" name="name" defaultValue={selectedOrg.name} labelBgClassName="bg-[var(--gbp-surface)]" />
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <SuperadminSelectField label="Estado" name="status" defaultValue={selectedOrg.status} labelBgClassName="bg-[var(--gbp-surface)]"><option value="active">Activo</option><option value="paused">Pausado</option><option value="suspended">Suspendido</option></SuperadminSelectField>
                      <SuperadminSelectField label="Plan" name="plan_id" defaultValue={selectedOrg.plan_id ?? ""} labelBgClassName="bg-[var(--gbp-surface)]"><option value="">Sin plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SuperadminSelectField>
                    </div>
                    <SubmitButton label="Actualizar Organización" pendingLabel="Actualizando..." variant="primary" className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-white" />
                    {selectedAdmins[0] && selectedAdmins[0].status === "invited" ? (
                      <div className="mt-4"><ResendInvitationButton organizationId={selectedOrg.id} email={selectedAdmins[0].email} fullName={selectedAdmins[0].email.split("@")[0]} /></div>
                    ) : null}
                  </form>
                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground"><LayoutGrid className="h-5 w-5 text-[var(--gbp-accent)]" /> Catálogo de Módulos</h4>
                    <div className="grid gap-3">
                      {modules.map((module) => {
                        const isEnabled = moduleMap.get(`${selectedOrg.id}:${module.id}`) ?? false;
                        const isCoreLocked = module.is_core;
                        return (
                          <form key={module.id} action={toggleOrganizationModuleAction} className="flex items-center justify-between rounded-lg p-1.5 hover:bg-[var(--gbp-bg2)]">
                            <input type="hidden" name="organization_id" value={selectedOrg.id} />
                            <input type="hidden" name="module_id" value={module.id} />
                            <input type="hidden" name="next_enabled" value={String(isCoreLocked ? true : !isEnabled)} />
                            <span className="text-sm font-bold text-foreground">{module.name}</span>
                            <button type="submit" disabled={isCoreLocked} className={`relative h-6 w-11 rounded-full ${isEnabled ? "bg-[var(--gbp-accent)]" : "bg-slate-300"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white ${isEnabled ? "left-[24px]" : "left-1"}`} /></button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {modalAction === "delete" && selectedOrg ? (
                <div className="space-y-6">
                  <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><h4 className="mt-2 text-lg font-bold text-red-900">Advertencia Crítica</h4></div>
                  <form action={deleteOrganizationAction} className="space-y-4">
                    <input type="hidden" name="organization_id" value={selectedOrg.id} />
                    <SuperadminInputField label="Confirmar slug" name="confirm_slug" required placeholder={selectedOrg.slug} className="text-center" />
                    <button type="submit" className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-black uppercase tracking-widest text-white">Confirmar Destrucción de Datos</button>
                  </form>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </PageContent>
  );
}
