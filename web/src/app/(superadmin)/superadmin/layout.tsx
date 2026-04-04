import { logoutAction } from "@/modules/auth/actions";
import { requireSuperadmin } from "@/shared/lib/access";
import { SuperadminRealtimeListener } from "@/shared/ui/superadmin-realtime-listener";
import { SuperadminTopbar } from "@/shared/ui/superadmin-topbar";

export const dynamic = "force-dynamic";

export default async function SuperadminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSuperadmin();

  return (
    <div data-theme="default" className="min-h-screen bg-[linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-bg)_42%,var(--gbp-bg2)_100%)]">
      <SuperadminRealtimeListener />
      <header className="sticky top-0 z-40 border-b border-[var(--gbp-border)]/70 bg-[color:color-mix(in_oklab,var(--gbp-surface)_82%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
          <SuperadminTopbar />

          <div className="hidden md:block">
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-2 text-sm font-bold text-[var(--gbp-text2)] transition-all hover:border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] hover:bg-[var(--gbp-error-soft)] hover:text-[var(--gbp-error)] shadow-sm"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500">
        {children}
      </div>
    </div>
  );
}
