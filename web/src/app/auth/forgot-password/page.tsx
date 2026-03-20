import type { Metadata } from "next";

import { requestPasswordRecoveryAction } from "@/modules/auth/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";

export const metadata: Metadata = {
  title: "Recuperar contrasena | GetBackplate",
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; status?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Acceso</p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Recuperar contrasena</h1>
          <p className="mb-6 text-sm text-neutral-600">
            Te enviaremos un enlace para definir una nueva contrasena.
          </p>

          {params.message ? (
            <div
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                params.status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {params.message}
            </div>
          ) : null}

          {params.error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </div>
          ) : null}

          <form action={requestPasswordRecoveryAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="admin@empresa.com"
              />
            </div>

            <SubmitButton
              label="Enviar enlace"
              pendingLabel="Enviando..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
