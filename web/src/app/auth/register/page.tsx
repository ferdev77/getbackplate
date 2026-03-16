import type { Metadata } from "next";
import Link from "next/link";
import { registerPublicAction } from "@/modules/auth/public-actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";

export const metadata: Metadata = {
  title: "Crear Cuenta | GetBackplate",
};

type RegisterPageProps = {
  searchParams: Promise<{ 
    error?: string; 
    priceId?: string;
    planId?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const error = params.error;
  const priceId = params.priceId;
  const planId = params.planId;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
            Únete a GetBackplate
          </p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
          <p className="mb-6 text-sm text-neutral-600">
            Registra tu restaurante y comienza a operar como los grandes.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form action={registerPublicAction} className="space-y-4">
            
            {/* Hidden fields to remember what plan they were trying to buy */}
            {priceId && <input type="hidden" name="priceId" value={priceId} />}
            {planId && <input type="hidden" name="planId" value={planId} />}

            <div>
              <label htmlFor="companyName" className="mb-1 block text-sm font-medium">
                Nombre de tu Empresa / Restaurante
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="Ej. Pizzería Los Hermanos"
              />
            </div>
            
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
                Tu Nombre Completo
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="Juan Pérez"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Correo Electrónico (Admin)
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="juan@empresa.com"
              />
            </div>
            
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <SubmitButton
              label={priceId ? "Crear cuenta y pagar" : "Crear cuenta"}
              pendingLabel="Registrando..."
              className="w-full mt-2"
            />
          </form>

          <div className="mt-6 text-center text-sm text-neutral-600">
            ¿Ya tienes una cuenta?{" "}
            <Link href="/auth/login" className="font-semibold text-brand hover:underline">
              Inicia sesión aquí
            </Link>
          </div>
        </section>
      </SlideUp>
    </main>
  );
}
