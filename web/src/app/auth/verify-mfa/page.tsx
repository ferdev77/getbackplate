import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/memberships/queries";
import { getActiveOrganizationIdFromCookie } from "@/shared/lib/tenant-selection";
import { verifyMfaCodeAction } from "@/modules/auth/mfa-actions";
import { createEmailMfaChallenge } from "@/modules/auth/mfa.service";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";
import { MfaResendButton } from "./mfa-resend-button";

export const metadata: Metadata = {
  title: "Verificación en dos pasos | GetBackplate",
};

type VerifyMfaPageProps = {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
};

export default async function VerifyMfaPage({ searchParams }: VerifyMfaPageProps) {
  const params = await searchParams;

  const user = await getCurrentUser();
  const organizationId = await getActiveOrganizationIdFromCookie();

  if (!user || !organizationId) {
    redirect("/auth/login");
  }

  const nextPath = params.next && params.next.startsWith("/") ? params.next : "/app/dashboard";
  const challenge = await createEmailMfaChallenge({
    userId: user.id,
    organizationId,
    email: user.email ?? "",
  });
  const initialCooldownSeconds = challenge.ok ? 45 : challenge.retryAfterSeconds ?? 0;
  const initialError = !challenge.ok && !challenge.retryAfterSeconds ? challenge.error : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex justify-center">
          <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
        </div>
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Verificación en dos pasos</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Revisá tu email</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Te mandamos un código de 6 dígitos a <strong>{user.email}</strong>. Ingresalo para continuar.
        </p>

        {params.error || initialError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error ?? initialError}
          </div>
        ) : null}
        {params.notice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {params.notice}
          </div>
        ) : null}

        <form action={verifyMfaCodeAction} className="space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-neutral-700">
              Código de verificación
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              required
              autoFocus
              placeholder="000000"
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-center text-2xl font-bold tracking-[0.5em] text-neutral-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <SubmitButton label="Verificar" pendingLabel="Verificando..." className="w-full" />
        </form>

        <MfaResendButton initialCooldownSeconds={initialCooldownSeconds} />
      </section>
    </main>
  );
}
