import type { Metadata } from "next";
import Link from "next/link";

import { SubmitButton } from "@/shared/ui/submit-button";

export const metadata: Metadata = {
  title: "Confirmar recuperacion | GetBackplate",
};

type RecoveryLinkPageProps = {
  searchParams: Promise<{ k?: string; org?: string }>;
};

export default async function RecoveryLinkPage({ searchParams }: RecoveryLinkPageProps) {
  const params = await searchParams;
  const key = String(params.k ?? "").trim();
  const organizationHint = String(params.org ?? "").trim();
  const forgotPasswordHref = organizationHint
    ? `/auth/forgot-password?org=${encodeURIComponent(organizationHint)}`
    : "/auth/forgot-password";

  if (!key) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
        <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <h1 className="mb-2 text-2xl font-bold tracking-tight">Enlace invalido</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            Este enlace de recuperacion no es valido. Solicita uno nuevo para continuar.
          </p>
          <Link
            href={forgotPasswordHref}
            className="inline-flex rounded-[var(--gbp-radius-lg)] bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-[var(--gbp-on-accent)] hover:bg-[var(--gbp-accent-hover)]"
          >
            Solicitar nuevo enlace
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Restablecer contrasena</h1>
        <p className="mb-6 text-sm text-[var(--gbp-text2)]">
          Para proteger tu acceso, confirma manualmente y te llevamos al cambio de contrasena.
        </p>

        <form action="/auth/recovery-link/continue" method="post" className="space-y-3">
          <input type="hidden" name="k" value={key} />
          <input type="hidden" name="org" value={organizationHint} />
          <SubmitButton label="Continuar de forma segura" pendingLabel="Continuando..." className="w-full" />
        </form>

        <p className="mt-4 text-xs text-[var(--gbp-text2)]">
          Si este enlace no funciona, solicita uno nuevo desde la pantalla de recuperacion.
        </p>
      </section>
    </main>
  );
}
