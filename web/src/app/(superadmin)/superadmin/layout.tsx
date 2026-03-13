import { logoutAction } from "@/modules/auth/actions";
import { requireSuperadmin } from "@/shared/lib/access";
import { SuperadminTopbar } from "@/shared/ui/superadmin-topbar";

export const dynamic = "force-dynamic";

export default async function SuperadminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSuperadmin();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f5f2_0%,#f5f4f0_42%,#f3f1ee_100%)]">
      <header className="sticky top-0 z-40 border-b border-[#e6dfda] bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
          <SuperadminTopbar />

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-xl border border-[#ddd2cc] bg-white px-3.5 py-1.5 text-sm font-medium text-[#5d544f] transition hover:border-[#c9bbb4] hover:bg-[#f8f4f2] hover:text-[#2f2925]"
            >
              Cerrar sesion
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
