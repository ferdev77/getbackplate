import Link from "next/link";
import { Building2, MapPin, Plus, Settings2, Users2 } from "lucide-react";

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
  upsertOrganizationSettingsAction,
} from "@/modules/settings/actions";
import { requireTenantModule } from "@/shared/lib/access";

type CompanySettingsPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; departmentId?: string }>;
};

function statusPill(active: boolean) {
  return active
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-neutral-200 bg-neutral-100 text-neutral-600";
}

export default async function CompanySettingsPage({ searchParams }: CompanySettingsPageProps) {
  const params = await searchParams;
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const [
    { data: organization },
    { data: orgSettings },
    { data: branches },
    { data: departments },
    { data: positions },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", tenant.organizationId)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select(
        "support_email, support_phone, timezone, primary_color, accent_color, dashboard_note, feedback_whatsapp",
      )
      .eq("organization_id", tenant.organizationId)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, city, state, country, address, is_active, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("organization_departments")
      .select("id, name, description, is_active, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("department_positions")
      .select("id, department_id, name, description, is_active, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const activeBranches = (branches ?? []).filter((row) => row.is_active).length;
  const activeDepartments = (departments ?? []).filter((row) => row.is_active).length;
  const activePositions = (positions ?? []).filter((row) => row.is_active).length;

  const openBranchModal = params.action === "new-branch";
  const openDepartmentModal = params.action === "new-department";

  const positionsByDepartment = new Map<string, Array<{ id: string; name: string; is_active: boolean }>>();
  for (const position of positions ?? []) {
    const list = positionsByDepartment.get(position.department_id) ?? [];
    list.push({ id: position.id, name: position.name, is_active: position.is_active });
    positionsByDepartment.set(position.department_id, list);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[#1f1a17]">
          <Settings2 className="h-4 w-4" />
          <h1 className="text-[18px] font-bold">Ajustes de Empresa</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/settings?action=new-branch#org-structure" className="inline-flex h-[33px] items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1]"><Plus className="h-3.5 w-3.5" /> Nueva Locacion</Link>
          <Link href="/app/settings?action=new-department#org-structure" className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b]"><Plus className="h-3.5 w-3.5" /> Nuevo Departamento</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-[#e7dfda] bg-white p-4"><p className="text-xs text-[#8d847f]">Empresa</p><p className="mt-1 truncate text-lg font-bold text-[#221d19]">{organization?.name ?? "Empresa"}</p></article>
        <article className="rounded-xl border border-[#e7dfda] bg-white p-4"><p className="text-xs text-[#8d847f]">Locaciones activas</p><p className="mt-1 text-lg font-bold text-[#221d19]">{activeBranches}</p></article>
        <article className="rounded-xl border border-[#e7dfda] bg-white p-4"><p className="text-xs text-[#8d847f]">Departamentos activos</p><p className="mt-1 text-lg font-bold text-[#221d19]">{activeDepartments}</p></article>
        <article className="rounded-xl border border-[#e7dfda] bg-white p-4"><p className="text-xs text-[#8d847f]">Puestos activos</p><p className="mt-1 text-lg font-bold text-[#221d19]">{activePositions}</p></article>
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
        <article className="rounded-2xl border border-[#e7dfda] bg-white p-5">
          <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase">
            <Settings2 className="h-3.5 w-3.5" /> Tenant
          </p>
          <p className="mb-1 text-base font-semibold text-[#2a2420]">{organization?.name ?? "Empresa"}</p>
          <p className="text-sm text-[#7b726d]">Configuracion operativa persistida por organizacion.</p>

          <form action={upsertOrganizationSettingsAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              name="support_email"
              type="email"
              defaultValue={orgSettings?.support_email ?? ""}
              placeholder="Email de soporte"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <input
              name="support_phone"
              defaultValue={orgSettings?.support_phone ?? ""}
              placeholder="Telefono soporte"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <input
              name="timezone"
              defaultValue={orgSettings?.timezone ?? "America/Argentina/Buenos_Aires"}
              placeholder="Timezone"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <input
              name="feedback_whatsapp"
              defaultValue={orgSettings?.feedback_whatsapp ?? ""}
              placeholder="WhatsApp feedback"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <input
              name="primary_color"
              defaultValue={orgSettings?.primary_color ?? "#b63a2f"}
              placeholder="Color primario"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <input
              name="accent_color"
              defaultValue={orgSettings?.accent_color ?? "#231f1c"}
              placeholder="Color acento"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <textarea
              name="dashboard_note"
              defaultValue={orgSettings?.dashboard_note ?? ""}
              placeholder="Nota operativa para el dashboard"
              rows={3}
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a2521] sm:col-span-2 sm:w-fit"
            >
              Guardar configuracion
            </button>
          </form>
        </article>
      </section>

      <section id="org-structure" className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-[#e7dfda] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase"><MapPin className="h-3.5 w-3.5" /> Locaciones</p><Link href="/app/settings?action=new-branch#org-structure" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1]"><Plus className="h-3.5 w-3.5" /> Agregar</Link></div>

          <div className="space-y-2">
            {(branches ?? []).map((branch) => (
              <details key={branch.id} className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#2a2420]">{branch.name}</p>
                    <p className="text-xs text-[#8b817c]">{[branch.city, branch.state, branch.country].filter(Boolean).join(", ") || "Sin ubicacion"}</p>
                  </div>
                  <form action={toggleBranchStatusAction}>
                    <input type="hidden" name="branch_id" value={branch.id} />
                    <input type="hidden" name="next_status" value={branch.is_active ? "inactive" : "active"} />
                    <button type="submit" className={`rounded-full border px-2.5 py-1 text-xs ${statusPill(branch.is_active)}`}>
                      {branch.is_active ? "Activa" : "Inactiva"}
                    </button>
                  </form>
                </summary>
                <form action={updateBranchAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="branch_id" value={branch.id} />
                  <input name="name" defaultValue={branch.name} required className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <input name="city" defaultValue={branch.city ?? ""} placeholder="Ciudad" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <input name="state" defaultValue={branch.state ?? ""} placeholder="Estado" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <input name="country" defaultValue={branch.country ?? ""} placeholder="Pais" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <input name="address" defaultValue={branch.address ?? ""} placeholder="Direccion" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2" />
                  <button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2a2521] sm:w-fit">Guardar cambios</button>
                </form>
              </details>
            ))}
            {!branches?.length ? <p className="text-sm text-[#8b817c]">Aun no hay locaciones.</p> : null}
          </div>
        </article>

        <article className="rounded-2xl border border-[#e7dfda] bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase"><Building2 className="h-3.5 w-3.5" /> Departamentos y Puestos</p><Link href="/app/settings?action=new-department#org-structure" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1]"><Plus className="h-3.5 w-3.5" /> Agregar</Link></div>

          <div className="space-y-2">
            {(departments ?? []).map((department) => (
              <details key={department.id} className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#2a2420]">{department.name}</p>
                    <p className="text-xs text-[#8b817c]">{department.description || "Sin descripcion"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(positionsByDepartment.get(department.id) ?? []).map((position) => (
                        <span key={position.id} className={`rounded-full border px-2 py-0.5 text-[10px] ${position.is_active ? "border-[#d9eadf] bg-[#f3fbf6] text-[#2d8f4f]" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{position.name}</span>
                      ))}
                      {!(positionsByDepartment.get(department.id) ?? []).length ? <span className="rounded-full border border-[#ece4df] bg-white px-2 py-0.5 text-[10px] text-[#8b817c]">Sin puestos</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={toggleDepartmentStatusAction}>
                      <input type="hidden" name="department_id" value={department.id} />
                      <input type="hidden" name="next_status" value={department.is_active ? "inactive" : "active"} />
                      <button type="submit" className={`rounded-full border px-2.5 py-1 text-xs ${statusPill(department.is_active)}`}>
                        {department.is_active ? "Activo" : "Inactivo"}
                      </button>
                    </form>
                  </div>
                </summary>
                <form action={updateDepartmentAction} className="mt-3 grid gap-2">
                  <input type="hidden" name="department_id" value={department.id} />
                  <input name="name" defaultValue={department.name} required className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <input name="description" defaultValue={department.description ?? ""} placeholder="Descripcion" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2a2521] sm:w-fit">Guardar cambios</button>
                </form>
                <details className="group relative mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1]"><Plus className="h-3.5 w-3.5" /> Agregar puesto</summary>
                  <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 ease-out group-open:grid-rows-[1fr] group-open:opacity-100">
                    <div className="overflow-hidden">
                      <div className="mt-2 w-full rounded-xl border border-[#e8dfda] bg-[#fffdfa] p-3">
                        <form action={createDepartmentPositionAction} className="grid gap-2">
                          <input type="hidden" name="department_id" value={department.id} />
                          <input name="name" required placeholder={`Nuevo puesto en ${department.name}`} className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                          <input name="description" placeholder="Descripcion (opcional)" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
                          <div className="flex justify-end"><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b]">Guardar puesto</button></div>
                        </form>
                      </div>
                    </div>
                  </div>
                </details>
                {(positionsByDepartment.get(department.id) ?? []).length ? (
                  <div className="mt-3 border-t border-[#efe7e2] pt-3">
                    <p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Puestos del departamento</p>
                    <div className="space-y-2">
                      {(positionsByDepartment.get(department.id) ?? []).map((position) => (
                        <div key={position.id} className="flex items-center justify-between rounded-lg border border-[#ece4df] bg-white px-3 py-2">
                          <p className="text-xs font-semibold text-[#2a2420]">{position.name}</p>
                          <form action={toggleDepartmentPositionStatusAction}>
                            <input type="hidden" name="position_id" value={position.id} />
                            <input type="hidden" name="next_status" value={position.is_active ? "inactive" : "active"} />
                            <button type="submit" className={`rounded-full border px-2.5 py-1 text-xs ${statusPill(position.is_active)}`}>
                              {position.is_active ? "Activo" : "Inactivo"}
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </details>
            ))}
            {!departments?.length ? <p className="text-sm text-[#8b817c]">Aun no hay departamentos.</p> : null}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-[#e7dfda] bg-white p-5">
        <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase"><Users2 className="h-3.5 w-3.5" /> Escalabilidad operativa</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853]">Locaciones y departamentos aislados por tenant</div>
          <div className="rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853]">Estados activos/inactivos sin borrar historial</div>
          <div className="rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853]">Puestos por departamento para flujos de empleados y checklists</div>
          <div className="rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853]">Diseno responsive para desktop/tablet/mobile</div>
        </div>
      </section>

      {openBranchModal ? (
        <div className="fixed inset-0 z-[1000] grid place-items-start bg-black/35 p-4 pt-24">
          <div className="w-full max-w-md rounded-2xl border border-[#e7dfda] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-[#201a17]">Nueva Locacion</p><Link href="/app/settings#org-structure" className="grid h-7 w-7 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link></div>
            <form action={createBranchAction} className="grid gap-2 sm:grid-cols-2">
              <input name="name" required placeholder="Nombre de locacion" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <input name="city" placeholder="Ciudad" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <input name="state" placeholder="Estado" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <input name="country" placeholder="Pais" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <input name="address" placeholder="Direccion" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2" />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1"><Link href="/app/settings#org-structure" className="rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1]">Cancelar</Link><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b]">Guardar</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {openDepartmentModal ? (
        <div className="fixed inset-0 z-[1000] grid place-items-start bg-black/35 p-4 pt-24">
          <div className="w-full max-w-md rounded-2xl border border-[#e7dfda] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-[#201a17]">Nuevo Departamento</p><Link href="/app/settings#org-structure" className="grid h-7 w-7 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link></div>
            <form action={createDepartmentAction} className="grid gap-2">
              <input name="name" required placeholder="Nombre de departamento" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <input name="description" placeholder="Descripcion (opcional)" className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-1"><Link href="/app/settings#org-structure" className="rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1]">Cancelar</Link><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b]">Guardar</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
