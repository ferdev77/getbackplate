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
    <div className="min-h-screen bg-[linear-gradient(180deg,#fcfaf8_0%,#f8f6f2_42%,#f5f3ef_100%)]">
      <SuperadminRealtimeListener />
      <header className="sticky top-0 z-40 border-b border-line/40 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
          <SuperadminTopbar />

          <div className="hidden md:block">
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-muted-foreground transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 shadow-sm"
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
