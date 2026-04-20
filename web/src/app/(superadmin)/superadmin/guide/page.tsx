"use client";

import { 
  BookOpen, 
  LayoutDashboard, 
  Building2, 
  Layers3, 
  ShieldCheck, 
  TrendingUp, 
  Zap
} from "lucide-react";
import * as motion from "framer-motion/client";
import { PageContent } from "@/shared/ui/page-content";

export default function SuperadminGuidePage() {
  return (
    <PageContent spacing="roomy" className="flex flex-col gap-10 py-12">
      {/* Header Section */}
      <section className="text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-brand/10 text-brand shadow-inner ring-1 ring-brand/20"
        >
          <BookOpen className="h-10 w-10" />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          Centro de <span className="text-brand italic">Conocimiento</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed"
        >
          Bienvenido al centro de mando de GetBackplate. Aquí aprenderás a dominar las herramientas que mantienen el ecosistema en funcionamiento.
        </motion.p>
      </section>

      {/* Grid: Conceptos Básicos */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { 
            title: "Dashboard", 
            desc: "Tu radar principal. Visualiza la salud global y detecta anomalías de inmediato.",
            icon: LayoutDashboard,
            color: "text-blue-600 bg-blue-50/50 border-blue-100"
          },
          { 
            title: "Organizaciones", 
            desc: "El corazón de la gestión. Donde controlas a cada restaurante de forma individual.",
            icon: Building2,
            color: "text-orange-600 bg-orange-50/50 border-orange-100"
          },
          { 
            title: "Módulos", 
            desc: "El arsenal técnico. Activa o desactiva funcionalidades según el crecimiento.",
            icon: Layers3,
            color: "text-purple-600 bg-purple-50/50 border-purple-100"
          },
          { 
            title: "Planes", 
            desc: "La oferta comercial. Define límites de almacenamiento, sucursales y usuarios.",
            icon: Zap,
            color: "text-amber-600 bg-amber-50/50 border-amber-100"
          }
        ].map((item, idx) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`group rounded-[2.5rem] border ${item.color} p-8 transition-all hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1`}
          >
            <item.icon className="mb-6 h-8 w-8 transition-transform group-hover:scale-110" />
            <h3 className="mb-3 text-xl font-bold text-foreground">{item.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
          </motion.div>
        ))}
      </section>

      {/* Deep Dive: El Score de Salud */}
      <section className="rounded-[3rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 md:p-12 shadow-sm overflow-hidden relative">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/5 blur-3xl" />
        
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
             <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700">
               <ShieldCheck className="h-4 w-4" /> Algoritmo de Salud Operativa
            </div>
            <h2 className="mb-6 text-2xl font-bold leading-tight text-foreground md:text-3xl">
              Entiende el <span className="text-brand">Score</span> de tus organizaciones.
            </h2>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              El score es un indicador dinámico (0-100) que mide qué tan bien está operando una organización. No es solo un número, es la seguridad de que el cliente está usando la plataforma correctamente.
            </p>
            
            <ul className="space-y-6">
              {[
                { 
                  color: "bg-emerald-500", 
                  title: "Saludable (85 - 100)", 
                  desc: "Restaurantes con administradores activos, configuraciones completas y uso continuo de módulos."
                },
                { 
                  color: "bg-amber-500", 
                  title: "En Alerta (65 - 84)", 
                  desc: "Organizaciones con baja actividad o que necesitan configurar módulos críticos próximamente."
                },
                { 
                  color: "bg-rose-500", 
                  title: "En Riesgo (< 65)", 
                  desc: "Sin administradores asignados, inactividad prolongada (>15 días) o almacenamiento al límite."
                }
              ].map((pill) => (
                <li key={pill.title} className="flex gap-4">
                  <div className={`mt-1.5 h-3 w-3 flex-shrink-0 rounded-full ${pill.color} shadow-lg shadow-${pill.color}/20`} />
                  <div>
                    <h4 className="text-base font-bold text-foreground">{pill.title}</h4>
                    <p className="text-sm text-muted-foreground">{pill.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
              <div className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 shadow-2xl">
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ejemplo de Radar</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
                
                <div className="space-y-6">
                   <div className="space-y-2">
                     <div className="flex items-center justify-between text-sm">
                       <span className="font-bold text-foreground">Restaurante El Gaucho</span>
                       <span className="font-black text-emerald-600 text-lg">94</span>
                     </div>
                     <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                        <motion.div initial={{ width: 0 }} animate={{ width: "94%" }} className="h-full bg-emerald-500" />
                     </div>
                   </div>

                   <div className="space-y-2">
                     <div className="flex items-center justify-between text-sm">
                       <span className="font-bold text-foreground">Bistró Central</span>
                       <span className="font-black text-rose-600 text-lg">42</span>
                     </div>
                     <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                        <motion.div initial={{ width: 0 }} animate={{ width: "42%" }} className="h-full bg-rose-500" />
                     </div>
                     <div className="flex flex-wrap gap-2 mt-2">
                        <span className="rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">Sin admin</span>
                        <span className="rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-700">Inactividad</span>
                     </div>
                   </div>
                </div>

                <div className="mt-10 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-center">
                   <p className="text-xs font-bold text-brand uppercase tracking-tighter">Tu objetivo: Mantener el promedio global {'>'} 80%</p>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-10 text-center text-white shadow-2xl">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
        <h2 className="mb-6 text-xl font-bold md:text-2xl">¿Listo para empezar la auditoría?</h2>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block">
          <a
            href="/superadmin/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--gbp-accent)] px-10 py-4 text-lg font-bold text-white shadow-[var(--gbp-shadow-accent)] hover:bg-[var(--gbp-accent-hover)] transition-all"
          >
            Ir al Dashboard <Zap className="h-5 w-5" />
          </a>
        </motion.div>
      </section>
    </PageContent>
  );
}
