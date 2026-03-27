"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { LayoutDashboard, ClipboardList, Folder, Bell, FileText, PanelsLeftRight, LogOut, Menu } from "lucide-react";

type EmployeeShellProps = {
  organizationName: string;
  children: React.ReactNode;
  employeeName: string;
  employeePosition: string | null;
  branchName: string | null;
  departmentName: string | null;
  docsCount: number;
  checklistTemplateNames: string[];
  enabledModules: {
    documents: boolean;
    checklists: boolean;
    announcements: boolean;
    onboarding: boolean;
  };
};

function initials(value: string) {
  const tokens = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!tokens.length) return "EM";
  return tokens.map((item) => item[0]?.toUpperCase() ?? "").join("");
}

export function EmployeeShell({
  organizationName,
  children,
  employeeName,
  employeePosition,
  branchName,
  departmentName,
  docsCount,
  checklistTemplateNames,
  enabledModules,
}: EmployeeShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Realtime: auto-refresh when any DB data changes
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("employee-shell-realtime")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          router.refresh();
        }, 500);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const items = [
    { href: "/portal/home", label: "Dashboard", icon: LayoutDashboard },
  ];
  if (enabledModules.announcements) {
    items.push({ href: "/portal/announcements", label: "Avisos", icon: Bell });
  }
  if (enabledModules.checklists) {
    items.push({ href: "/portal/checklist", label: "Checklists", icon: ClipboardList });
  }
  if (enabledModules.documents) {
    items.push({ href: "/portal/documents", label: "Documentos", icon: Folder });
  }
  if (enabledModules.onboarding) {
    items.push({ href: "/portal/onboarding", label: "Instrucciones", icon: FileText });
  }

  const sidebarWidth = collapsed ? "w-[56px]" : "w-[240px]";
  const sidebarPaddingX = collapsed ? "px-2" : "px-4";

  const palette = {
    accent: "#c0392b",
    sidebarGradient: "linear-gradient(170deg,#f8f8fa 0%,#f2f2f5 100%)",
    pageGradient: "linear-gradient(180deg,#f8f5f2 0%,#f5f4f0 45%,#f3f2ee 100%)",
    pageBg: "#f5f4f0",
    headerBg: "#ffffff",
  };

  const currentLabel = items.find(item => pathname.startsWith(item.href))?.label || "Portal";

  return (
    <div className="min-h-screen text-[#1a1a1a]" style={{ background: palette.pageGradient }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-black/10 transition-all duration-200 lg:sticky lg:top-0 lg:h-screen ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${sidebarWidth}`} style={{ background: palette.sidebarGradient }}>
          <div className={`flex h-[60px] items-center border-b border-black/10 py-3 ${sidebarPaddingX}`}>
            <div className={`flex items-center gap-2 ${collapsed ? "justify-center w-full" : "w-full"}`}>
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#111] text-xs font-bold text-white">EM</div>
              {!collapsed ? <p className="truncate text-sm font-semibold text-[#0f1923]">{organizationName}</p> : null}
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className={`ml-auto hidden h-8 w-8 place-items-center rounded-md bg-black/5 text-black/60 hover:bg-black/10 hover:text-black/90 lg:grid ${collapsed ? "ml-0" : ""}`}
                aria-label="Alternar sidebar"
              >
                <PanelsLeftRight className="h-4 w-4" />
              </button>
              <button 
                type="button" 
                onClick={() => setMenuOpen(false)} 
                className="ml-auto grid h-8 w-8 place-items-center rounded-md bg-black/5 text-black/60 hover:bg-black/10 hover:text-black/90 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto py-4">
            <p className={`mb-2 px-5 text-[10px] font-bold uppercase tracking-[0.13em] text-black/35 ${collapsed ? "text-center px-0" : ""}`}>
              {collapsed ? "..." : "Navegación"}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 border-l-[2.5px] text-[13px] transition ${
                      collapsed ? "justify-center px-0 py-2.5" : "px-5 py-2"
                    } ${
                      active
                        ? "bg-black/5 font-semibold text-[#111]"
                        : "border-l-transparent text-black/60 hover:border-l-black/20 hover:bg-black/5 hover:text-black/85"
                    }`}
                    style={active ? { borderLeftColor: palette.accent } : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span>{item.label}</span> : null}
                    {!collapsed && active && item.href === "/portal/documents" && docsCount > 0 && (
                      <span className="ml-auto rounded-full bg-[#c0392b] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {docsCount}
                      </span>
                    )}
                    {!collapsed && active && item.href === "/portal/checklist" && checklistTemplateNames.length > 0 && (
                      <span className="ml-auto rounded-full bg-[#c0392b] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {checklistTemplateNames.length}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className={`mt-auto border-t border-black/10 py-4 ${sidebarPaddingX}`} style={{ background: palette.sidebarGradient }}>
            {!collapsed ? (
              <div className="mb-4 flex items-center gap-2.5 px-1">
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: palette.accent }}>
                  {initials(employeeName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#222]">{employeeName}</p>
                  <p className="truncate text-[11px] text-[#9a9a9a]">{employeePosition || "Empleado"}</p>
                </div>
              </div>
            ) : null}

            <a
              href="/auth/logout"
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-black/10 bg-black/5 py-2 text-xs text-[#666] transition hover:bg-black/10 hover:text-[#222] ${
                collapsed ? "h-9 w-9 p-0" : "px-2"
              }`}
              title="Cerrar Sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed ? <span>Cerrar Sesión</span> : null}
            </a>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />
        )}

        {/* Main Content Area */}
        <div className="min-w-0 flex-1 flex flex-col" style={{ background: palette.pageBg }}>
          <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b-[1.5px] border-[#e8e8e8] px-4 sm:px-8" style={{ background: palette.headerBg }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#ddd5d0] bg-white text-[#4c4a48] lg:hidden"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <p className="font-serif text-[19px] font-bold text-[#111]">{currentLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-[rgba(0,0,0,0.06)] bg-[#faf9f8] px-2.5 py-1 text-xs text-[#6f6965] sm:inline shadow-sm">
                {branchName || "Sucursal"}
              </span>
              <span className="hidden rounded-full border border-[#f0d8d3] bg-[#fff4f2] px-2.5 py-1 text-xs text-[#8f3a30] sm:inline shadow-sm">
                Soy Empleado
              </span>
            </div>
          </header>
          
          <main className="flex-1 w-full p-4 sm:p-8">
            <div className="mx-auto max-w-[1000px] w-full">{children}</div>
          </main>
          
          <footer className="mt-auto flex justify-between border-t border-black/10 px-6 py-4 text-[11px] text-[#999] sm:px-9" style={{ background: palette.sidebarGradient }}>
            <p className="font-semibold tracking-[0.02em] text-[#8e8e8e]">{organizationName}</p>
            <p>© 2026 GetBackplate · v1</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

