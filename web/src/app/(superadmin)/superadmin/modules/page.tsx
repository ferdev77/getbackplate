import { Boxes, ChevronDown, Puzzle, Save, Info, ShieldCheck, Zap } from "lucide-react";
import * as motion from "framer-motion/client";

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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-light/60">Infraestructura & Capacidades</p>
          <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Catálogo de Módulos</h1>
          <p className="mt-4 max-w-2xl text-base text-white/70 leading-relaxed">
            Gestione la arquitectura funcional del sistema. Defina qué componentes son piezas fundamentales del núcleo y cuáles son extensiones comerciales.
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

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "Módulos Registrados", val: modules?.length ?? 0, icon: Puzzle, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]" },
          { label: "Implementaciones Activas", val: tenantBindings ?? 0, icon: Boxes, color: "text-brand-dark", bg: "bg-brand/5" },
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

      <section className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm overflow-hidden">
        <div className="mb-8 px-2">
           <h2 className="text-xl font-bold tracking-tight text-foreground">Inventario de Componentes</h2>
           <p className="text-xs text-muted-foreground mt-1">Configure las propiedades de cada módulo en el ecosistema.</p>
        </div>

        <div className="grid gap-4">
          {(modules ?? []).map((module, idx) => {
            const isCoreLocked = module.is_core && NON_DEMOTABLE_CORE_MODULES.has(module.code);
            return (
              <motion.details 
                key={module.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group relative overflow-hidden rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 transition-all hover:bg-[var(--gbp-surface)] sm:px-8 sm:py-6"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                       <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${module.is_core ? 'bg-emerald-50 text-emerald-600' : 'bg-brand/5 text-brand'}`}>
                          {module.is_core ? <ShieldCheck className="h-6 w-6" /> : <Zap className="h-6 w-6" />}
                       </div>
                       <div>
                          <h3 className="text-lg font-bold text-foreground">{module.name}</h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{module.code}</p>
                       </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-6">
                       <div className="flex items-center gap-2 text-sm text-foreground/60 italic max-w-xs truncate">
                          <Info className="h-4 w-4 shrink-0" />
                          <span>{module.description || "Sin descripción operativa."}</span>
                       </div>
                       <span className={`rounded-xl border px-3 py-1 text-[11px] font-black uppercase tracking-tighter ${module.is_core ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-muted/20 text-muted-foreground'}`}>
                          {module.is_core ? 'Estatus: Central (Core)' : 'Estatus: Opcional'}
                       </span>
                    </div>
                  </div>
                  <ChevronDown className="h-5 w-5 text-muted-foreground/40 transition-transform group-open:rotate-180" />
                </summary>

                <div className="mt-8 border-t border-line/20 pt-8">
                  <form action={updateModuleAction} className="grid gap-6 sm:grid-cols-4 items-end">
                    <input type="hidden" name="module_id" value={module.id} />
                    <SuperadminInputField label="Identificador de Sistema" value={module.code} disabled className="bg-muted/10 opacity-70" />
                    <SuperadminInputField label="Nombre de Módulo" name="name" defaultValue={module.name} spellCheck={false} />
                    <SuperadminInputField label="Descripción Operativa" name="description" defaultValue={module.description ?? ""} className="sm:col-span-2" />
                    
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:col-span-4 mt-2">
                       <label className="flex items-center gap-3 cursor-pointer group/check">
                          <input
                            type="checkbox"
                            name="is_core"
                            defaultChecked={module.is_core}
                            disabled={isCoreLocked}
                            className="h-6 w-11 rounded-full accent-emerald-600 transition-all checked:bg-emerald-600"
                          />
                          <div className="flex flex-col">
                             <span className="text-sm font-bold text-foreground">Marcar como Componente Core</span>
                             {isCoreLocked && <p className="text-[10px] text-rose-500 font-bold uppercase">Restricción: Módulo vital del sistema</p>}
                          </div>
                       </label>

                        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-text)] px-8 py-3 text-xs font-bold text-white shadow-lg shadow-black/10 transition-all hover:opacity-90 hover:scale-[1.02]">
                          <Save className="h-4 w-4" /> Sincronizar Módulo
                       </button>
                    </div>
                  </form>
                </div>
              </motion.details>
            );
          })}
        </div>
      </section>
    </main>
  );
}
