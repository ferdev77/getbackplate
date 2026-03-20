import type { Metadata } from "next";

import { updatePasswordAction } from "@/modules/auth/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";

export const metadata: Metadata = {
  title: "Cambiar contrasena | GetBackplate",
};

type ChangePasswordPageProps = {
  searchParams: Promise<{ error?: string; reason?: string; next?: string }>;
};

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const params = await searchParams;
  const reason = params.reason;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "/app/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Seguridad</p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Cambiar contrasena</h1>
          <p className="mb-6 text-sm text-neutral-600">
            {reason === "first_login"
              ? "Por seguridad, debes cambiar la contrasena temporal antes de continuar."
              : "Define tu nueva contrasena para recuperar acceso a la plataforma."}
          </p>

          {params.error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </div>
          ) : null}

          <form action={updatePasswordAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">
                Nueva contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="Minimo 8 caracteres"
              />
            </div>

            <div>
              <label htmlFor="confirm_password" className="mb-1 block text-sm font-medium">
                Confirmar contrasena
              </label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                minLength={8}
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="Repite la contrasena"
              />
            </div>

            <SubmitButton
              label="Actualizar contrasena"
              pendingLabel="Actualizando..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
