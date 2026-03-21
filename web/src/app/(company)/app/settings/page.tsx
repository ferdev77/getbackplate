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

const DARK_CARD = "[.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_CARD_SOFT = "[.theme-dark-pro_&]:border-[#263244] [.theme-dark-pro_&]:bg-[#111824]";
const DARK_INPUT = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:placeholder:text-[#7f8ea3]";
const DARK_TEXT_STRONG = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_TEXT_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_BTN_GHOST = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2] [.theme-dark-pro_&]:hover:bg-[#172131]";

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
      .select("name, plan_id, plans(name)")
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
        <div className={`inline-flex items-center gap-2 text-[#1f1a17] ${DARK_TEXT_STRONG}`}>
          <Settings2 className="h-4 w-4" />
          <h1 className="text-[18px] font-bold">Ajustes de Empresa</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/settings?action=new-branch#org-structure" className={`inline-flex h-[33px] items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}><Plus className="h-3.5 w-3.5" /> Nueva Locacion</Link>
          <Link href="/app/settings?action=new-department#org-structure" className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b] [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:text-white [.theme-dark-pro_&]:hover:bg-[#3a73c6]"><Plus className="h-3.5 w-3.5" /> Nuevo Departamento</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className={`rounded-xl border border-[#e7dfda] bg-white p-4 ${DARK_CARD}`}><p className={`text-xs text-[#8d847f] ${DARK_TEXT_MUTED}`}>Empresa</p><p className={`mt-1 truncate text-lg font-bold text-[#221d19] ${DARK_TEXT_STRONG}`}>{organization?.name ?? "Empresa"}</p></article>
        <article className={`rounded-xl border border-[#e7dfda] bg-white p-4 ${DARK_CARD}`}><p className={`text-xs text-[#8d847f] ${DARK_TEXT_MUTED}`}>Locaciones activas</p><p className={`mt-1 text-lg font-bold text-[#221d19] ${DARK_TEXT_STRONG}`}>{activeBranches}</p></article>
        <article className={`rounded-xl border border-[#e7dfda] bg-white p-4 ${DARK_CARD}`}><p className={`text-xs text-[#8d847f] ${DARK_TEXT_MUTED}`}>Departamentos activos</p><p className={`mt-1 text-lg font-bold text-[#221d19] ${DARK_TEXT_STRONG}`}>{activeDepartments}</p></article>
        <article className={`rounded-xl border border-[#e7dfda] bg-white p-4 ${DARK_CARD}`}><p className={`text-xs text-[#8d847f] ${DARK_TEXT_MUTED}`}>Puestos activos</p><p className={`mt-1 text-lg font-bold text-[#221d19] ${DARK_TEXT_STRONG}`}>{activePositions}</p></article>
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
        <article className={`rounded-2xl border border-[#e7dfda] bg-white p-5 ${DARK_CARD}`}>
          <p className={`mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase ${DARK_TEXT_MUTED}`}>
            <Settings2 className="h-3.5 w-3.5" /> Tenant
          </p>
          <p className={`mb-1 text-base font-semibold text-[#2a2420] ${DARK_TEXT_STRONG}`}>{organization?.name ?? "Empresa"}</p>
          <p className={`text-sm text-[#7b726d] ${DARK_TEXT_MUTED}`}>Configuracion operativa persistida por organizacion.</p>

          <form action={upsertOrganizationSettingsAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              name="support_email"
              type="email"
              defaultValue={orgSettings?.support_email ?? ""}
              placeholder="Email de soporte"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <input
              name="support_phone"
              defaultValue={orgSettings?.support_phone ?? ""}
              placeholder="Telefono soporte"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <input
              name="timezone"
              defaultValue={orgSettings?.timezone ?? "America/Argentina/Buenos_Aires"}
              placeholder="Timezone"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <input
              name="feedback_whatsapp"
              defaultValue={orgSettings?.feedback_whatsapp ?? ""}
              placeholder="WhatsApp feedback"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <input
              name="primary_color"
              defaultValue={orgSettings?.primary_color ?? "#b63a2f"}
              placeholder="Color primario"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <input
              name="accent_color"
              defaultValue={orgSettings?.accent_color ?? "#231f1c"}
              placeholder="Color acento"
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`}
            />
            <textarea
              name="dashboard_note"
              defaultValue={orgSettings?.dashboard_note ?? ""}
              placeholder="Nota operativa para el dashboard"
              rows={3}
              className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2 ${DARK_INPUT}`}
            />
            <button
              type="submit"
              className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a2521] sm:col-span-2 sm:w-fit [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]"
            >
              Guardar configuracion
            </button>
          </form>
        </article>
      </section>

      <section id="org-structure" className="grid gap-4 xl:grid-cols-2">
        <article className={`rounded-2xl border border-[#e7dfda] bg-white p-5 ${DARK_CARD}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><p className={`inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase ${DARK_TEXT_MUTED}`}><MapPin className="h-3.5 w-3.5" /> Locaciones</p><Link href="/app/settings?action=new-branch#org-structure" className={`inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}><Plus className="h-3.5 w-3.5" /> Agregar</Link></div>

          <div className="space-y-2">
            {(branches ?? []).map((branch) => (
              <details key={branch.id} className={`rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3 ${DARK_CARD_SOFT}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold text-[#2a2420] ${DARK_TEXT_STRONG}`}>{branch.name}</p>
                    <p className={`text-xs text-[#8b817c] ${DARK_TEXT_MUTED}`}>{[branch.city, branch.state, branch.country].filter(Boolean).join(", ") || "Sin ubicacion"}</p>
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
                  <input name="name" defaultValue={branch.name} required className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <input name="city" defaultValue={branch.city ?? ""} placeholder="Ciudad" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <input name="state" defaultValue={branch.state ?? ""} placeholder="Estado" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <input name="country" defaultValue={branch.country ?? ""} placeholder="Pais" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <input name="address" defaultValue={branch.address ?? ""} placeholder="Direccion" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2 ${DARK_INPUT}`} />
                  <button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2a2521] sm:w-fit [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]">Guardar cambios</button>
                </form>
              </details>
            ))}
            {!branches?.length ? <p className={`text-sm text-[#8b817c] ${DARK_TEXT_MUTED}`}>Aun no hay locaciones.</p> : null}
          </div>
        </article>

        <article className={`rounded-2xl border border-[#e7dfda] bg-white p-5 ${DARK_CARD}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><p className={`inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase ${DARK_TEXT_MUTED}`}><Building2 className="h-3.5 w-3.5" /> Departamentos y Puestos</p><Link href="/app/settings?action=new-department#org-structure" className={`inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}><Plus className="h-3.5 w-3.5" /> Agregar</Link></div>

          <div className="space-y-2">
            {(departments ?? []).map((department) => (
              <details key={department.id} className={`rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3 ${DARK_CARD_SOFT}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={`text-sm font-semibold text-[#2a2420] ${DARK_TEXT_STRONG}`}>{department.name}</p>
                    <p className={`text-xs text-[#8b817c] ${DARK_TEXT_MUTED}`}>{department.description || "Sin descripcion"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(positionsByDepartment.get(department.id) ?? []).map((position) => (
                        <span key={position.id} className={`rounded-full border px-2 py-0.5 text-[10px] ${position.is_active ? "border-[#d9eadf] bg-[#f3fbf6] text-[#2d8f4f]" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{position.name}</span>
                      ))}
                      {!(positionsByDepartment.get(department.id) ?? []).length ? <span className={`rounded-full border border-[#ece4df] bg-white px-2 py-0.5 text-[10px] text-[#8b817c] ${DARK_BTN_GHOST}`}>Sin puestos</span> : null}
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
                  <input name="name" defaultValue={department.name} required className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <input name="description" defaultValue={department.description ?? ""} placeholder="Descripcion" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                  <button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#2a2521] sm:w-fit [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]">Guardar cambios</button>
                </form>
                <details className="group relative mt-3">
                  <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}><Plus className="h-3.5 w-3.5" /> Agregar puesto</summary>
                  <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 ease-out group-open:grid-rows-[1fr] group-open:opacity-100">
                    <div className="overflow-hidden">
                      <div className={`mt-2 w-full rounded-xl border border-[#e8dfda] bg-[#fffdfa] p-3 ${DARK_CARD_SOFT}`}>
                        <form action={createDepartmentPositionAction} className="grid gap-2">
                          <input type="hidden" name="department_id" value={department.id} />
                          <input name="name" required placeholder={`Nuevo puesto en ${department.name}`} className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                          <input name="description" placeholder="Descripcion (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
                          <div className="flex justify-end"><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b] [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]">Guardar puesto</button></div>
                        </form>
                      </div>
                    </div>
                  </div>
                </details>
                {(positionsByDepartment.get(department.id) ?? []).length ? (
                  <div className="mt-3 border-t border-[#efe7e2] pt-3 [.theme-dark-pro_&]:border-[#2c3646]">
                    <p className={`mb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase ${DARK_TEXT_MUTED}`}>Puestos del departamento</p>
                    <div className="space-y-2">
                      {(positionsByDepartment.get(department.id) ?? []).map((position) => (
                        <div key={position.id} className={`flex items-center justify-between rounded-lg border border-[#ece4df] bg-white px-3 py-2 ${DARK_CARD_SOFT}`}>
                          <p className={`text-xs font-semibold text-[#2a2420] ${DARK_TEXT_STRONG}`}>{position.name}</p>
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
            {!departments?.length ? <p className={`text-sm text-[#8b817c] ${DARK_TEXT_MUTED}`}>Aun no hay departamentos.</p> : null}
          </div>
        </article>
      </section>

      <section className={`rounded-2xl border border-[#e7dfda] bg-white p-5 ${DARK_CARD}`}>
        <p className={`mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase ${DARK_TEXT_MUTED}`}><Users2 className="h-3.5 w-3.5" /> Escalabilidad operativa</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853] ${DARK_CARD_SOFT} ${DARK_TEXT_MUTED}`}>Locaciones y departamentos aislados por tenant</div>
          <div className={`rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853] ${DARK_CARD_SOFT} ${DARK_TEXT_MUTED}`}>Estados activos/inactivos sin borrar historial</div>
          <div className={`rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853] ${DARK_CARD_SOFT} ${DARK_TEXT_MUTED}`}>Puestos por departamento para flujos de empleados y checklists</div>
          <div className={`rounded-lg border border-[#efe7e2] bg-[#fffcfa] px-3 py-2 text-sm text-[#5f5853] ${DARK_CARD_SOFT} ${DARK_TEXT_MUTED}`}>Diseno responsive para desktop/tablet/mobile</div>
        </div>
      </section>

      {openBranchModal ? (
        <div className="fixed inset-0 z-[1000] grid place-items-start bg-black/35 p-4 pt-24">
          <div className={`w-full max-w-md rounded-2xl border border-[#e7dfda] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,.18)] ${DARK_CARD}`}>
            <div className="mb-3 flex items-center justify-between"><p className={`text-sm font-bold text-[#201a17] ${DARK_TEXT_STRONG}`}>Nueva Locacion</p><Link href="/app/settings#org-structure" className="grid h-7 w-7 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] [.theme-dark-pro_&]:text-[#8ea1bc] [.theme-dark-pro_&]:hover:bg-[#1c2635] [.theme-dark-pro_&]:hover:text-[#e7edf7]">✕</Link></div>
            <form action={createBranchAction} className="grid gap-2 sm:grid-cols-2">
              <input name="name" required placeholder="Nombre de locacion" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <input name="city" placeholder="Ciudad" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <input name="state" placeholder="Estado" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <input name="country" placeholder="Pais" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <input name="address" placeholder="Direccion" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2 ${DARK_INPUT}`} />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1"><Link href="/app/settings#org-structure" className={`rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}>Cancelar</Link><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b] [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]">Guardar</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {openDepartmentModal ? (
        <div className="fixed inset-0 z-[1000] grid place-items-start bg-black/35 p-4 pt-24">
          <div className={`w-full max-w-md rounded-2xl border border-[#e7dfda] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,.18)] ${DARK_CARD}`}>
            <div className="mb-3 flex items-center justify-between"><p className={`text-sm font-bold text-[#201a17] ${DARK_TEXT_STRONG}`}>Nuevo Departamento</p><Link href="/app/settings#org-structure" className="grid h-7 w-7 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] [.theme-dark-pro_&]:text-[#8ea1bc] [.theme-dark-pro_&]:hover:bg-[#1c2635] [.theme-dark-pro_&]:hover:text-[#e7edf7]">✕</Link></div>
            <form action={createDepartmentAction} className="grid gap-2">
              <input name="name" required placeholder="Nombre de departamento" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <input name="description" placeholder="Descripcion (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm ${DARK_INPUT}`} />
              <div className="flex justify-end gap-2 pt-1"><Link href="/app/settings#org-structure" className={`rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1] ${DARK_BTN_GHOST}`}>Cancelar</Link><button type="submit" className="rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white hover:bg-[#c0392b] [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]">Guardar</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
