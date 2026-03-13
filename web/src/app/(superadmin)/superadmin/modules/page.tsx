import { Boxes, ChevronDown, Puzzle, Save } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  updateModuleAction,
} from "@/modules/modules-catalog/actions";
import { SuperadminInputField } from "@/shared/ui/superadmin-form-fields";

type SuperadminModulesPageProps = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

const NON_DEMOTABLE_CORE_MODULES = new Set(["dashboard", "settings", "employees", "documents"]);

export default async function SuperadminModulesPage({ searchParams }: SuperadminModulesPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;

  const [{ data: modules }, { count: tenantBindings }] = await Promise.all([
    supabase
      .from("module_catalog")
      .select("id, code, name, description, is_core, created_at")
      .order("name"),
    supabase
      .from("organization_modules")
      .select("id", { count: "exact", head: true }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[#9c938d] uppercase">Superadmin</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-[#241f1c]">Catalogo de modulos</h1>
        <p className="text-sm text-[#6b635e]">Gestion de modulos vendibles y su caracter core del producto.</p>
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

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-[#e5ddd8] bg-white p-4">
          <p className="text-xs text-[#8d847f]">Modulos definidos</p>
          <p className="mt-1 text-2xl font-bold text-[#251f1b]">{modules?.length ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#e5ddd8] bg-white p-4">
          <p className="text-xs text-[#8d847f]">Asignaciones tenant-modulo</p>
          <p className="mt-1 text-2xl font-bold text-[#251f1b]">{tenantBindings ?? 0}</p>
        </article>
      </section>

      <section className="space-y-3">
        {(modules ?? []).map((module) => {
          const isCoreLocked = module.is_core && NON_DEMOTABLE_CORE_MODULES.has(module.code);
          return (
          <details key={module.id} className="group rounded-2xl border border-[#e5ddd8] bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div className="grid flex-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#2a2420]">{module.name}</p>
                  <p className="truncate text-xs text-[#837a75]">{module.code}</p>
                </div>
                <div className="flex items-center gap-1 text-sm text-[#4f4843]">
                  <Puzzle className="h-4 w-4 text-[#5e5752]" />
                  <span>{module.description || "Sin descripcion"}</span>
                </div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${module.is_core ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>
                  <Boxes className="h-3.5 w-3.5" /> {module.is_core ? "Core" : "Opcional"}
                </span>
              </div>
              <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
            </summary>

            <div className="mt-4 border-t border-[#eee6e1] pt-4">
              <form action={updateModuleAction} className="grid gap-2 sm:grid-cols-4">
                <input type="hidden" name="module_id" value={module.id} />
                <SuperadminInputField label="Code" value={module.code} disabled fieldClassName="bg-neutral-100" />
                <SuperadminInputField label="Nombre" name="name" defaultValue={module.name} spellCheck={false} autoCorrect="off" />
                <SuperadminInputField label="Descripcion" name="description" defaultValue={module.description ?? ""} className="sm:col-span-2" />
                <label className="inline-flex items-center gap-2 text-sm text-[#4f4843]">
                  <input
                    type="checkbox"
                    name="is_core"
                    defaultChecked={module.is_core}
                    disabled={isCoreLocked}
                    className="h-4 w-4"
                  />
                  Core
                </label>
                {isCoreLocked ? <p className="text-xs text-[#7a716b]">Este modulo core es vital y no puede convertirse en opcional.</p> : null}
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#4f4843] hover:bg-[#f8f3f1] sm:w-fit">
                  <Save className="h-4 w-4" /> Guardar cambios
                </button>
              </form>
            </div>
          </details>
          );
        })}
      </section>
    </main>
  );
}
