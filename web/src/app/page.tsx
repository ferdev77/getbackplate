import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getCurrentUserMemberships,
  isCurrentUserSuperadmin,
} from "@/modules/memberships/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  const isSuperadmin = user ? await isCurrentUserSuperadmin() : false;

  if (user) {
    if (isSuperadmin) {
      redirect("/superadmin/dashboard");
    }

    const memberships = await getCurrentUserMemberships();
    const codes = new Set(memberships.map((row) => row.roleCode));

    if (codes.has("company_admin") || codes.has("manager")) {
      redirect("/app/dashboard");
    }

    if (codes.has("employee")) {
      redirect("/portal/home");
    }

    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-12 sm:px-10">
      <div className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(182,58,47,0.2),transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(182,58,47,0.12),transparent_70%)]" />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-brand uppercase">
            Base tecnica creada
          </p>
          <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
            SaaS multi-tenant listo para arrancar Fase 1
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-neutral-600 sm:text-base">
            Ya esta creado el proyecto Next.js con TypeScript y Tailwind, la base
            de Supabase (migraciones + seed) y la estructura modular por capas
            para separar superadmin, empresa y empleado.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-xl border border-line bg-white p-5">
            <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-neutral-500 uppercase">
              Superadmin
            </p>
            <p className="text-sm text-neutral-700">
              Rutas preparadas para empresas, modulos, planes y control global.
            </p>
          </article>
          <article className="rounded-xl border border-line bg-white p-5">
            <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-neutral-500 uppercase">
              Empresa
            </p>
            <p className="text-sm text-neutral-700">
              Estructura lista para empleados, documentos, anuncios y reportes.
            </p>
          </article>
          <article className="rounded-xl border border-line bg-white p-5">
            <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-neutral-500 uppercase">
              Empleado
            </p>
            <p className="text-sm text-neutral-700">
              Base separada para onboarding, portal y checklist operativo.
            </p>
          </article>
        </section>

        <section className="rounded-xl border border-line bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold">Siguientes pasos inmediatos</h2>
          <div className="space-y-2 text-sm text-neutral-700">
            <Link
              href="/auth/login"
              className="inline-block rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
            >
              Iniciar sesion
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
