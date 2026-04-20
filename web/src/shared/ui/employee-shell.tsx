"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { LayoutDashboard, ClipboardList, Folder, Bell, FileText, PanelsLeftRight, LogOut, Menu, User } from "lucide-react";
import { NewEmployeeModal, type EmployeeModalInitialData, type ModalBranch, type ModalDepartment, type ModalPosition } from "@/modules/employees/ui/new-employee-modal";
import { GetBackplateLogo } from "@/shared/ui/getbackplate-logo";
import { GetBackplateMark } from "@/shared/ui/getbackplate-mark";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";
import { PageContent } from "@/shared/ui/page-content";
import { TooltipLabel } from "@/shared/ui/tooltip";

const CHECKLIST_PREVIEW_GUARD_KEY = "portal-checklist-preview-guard";
const CHECKLIST_PREVIEW_GUARD_TTL_MS = 15000;

type EmployeeShellProps = {
  organizationId: string;
  membershipId: string;
  userId: string;
  employeeId: string | null;
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
  customBrandingEnabled: boolean;
  companyLogoUrl: string;
  employeeProfile: EmployeeModalInitialData;
  profileBranches: ModalBranch[];
  profileDepartments: ModalDepartment[];
  profilePositions: ModalPosition[];
  realtimeAccessToken?: string | null;
};

function initials(value: string) {
  const tokens = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!tokens.length) return "EM";
  return tokens.map((item) => item[0]?.toUpperCase() ?? "").join("");
}

export function EmployeeShell({
  organizationId,
  membershipId,
  userId,
  employeeId,
  organizationName,
  children,
  employeeName,
  employeePosition,
  branchName,
  departmentName,
  docsCount,
  checklistTemplateNames,
  enabledModules,
  customBrandingEnabled,
  companyLogoUrl,
  employeeProfile,
  profileBranches,
  profileDepartments,
  profilePositions,
  realtimeAccessToken,
}: EmployeeShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Realtime: auto-refresh when employee portal scoped data changes
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (realtimeAccessToken) {
      supabase.realtime.setAuth(realtimeAccessToken);
    }
    const orgFilter = `organization_id=eq.${organizationId}`;
    const fastRealtimePaths = ["/portal/checklist", "/portal/home", "/portal/announcements", "/portal/documents"];
    const refreshDelayMs = fastRealtimePaths.some((prefix) => pathname.startsWith(prefix)) ? 450 : 2000;
    const employeeUploadCooldownKey = "gbp.employee.docs.upload.cooldown";
    const employeeUploadInflightKey = "gbp.employee.docs.upload.inflight";
    const ownSubmissionFilter = `submitted_by=eq.${userId}`;
    const checklistJobsFilter = orgFilter;
    const ownEmployeeFilter = `user_id=eq.${userId}`;
    const ownEmployeeByIdFilter = employeeId ? `id=eq.${employeeId}` : "";
    const ownPreferencesFilter = `user_id=eq.${userId}`;
    const ownProfileFilter = `user_id=eq.${userId}`;
    const ownMembershipFilter = `id=eq.${membershipId}`;
    const ownDelegatedPermissionsFilter = `membership_id=eq.${membershipId}`;

    const subscriptions: Array<{ table: string; filter: string }> = [
      { table: "organization_modules", filter: orgFilter },
      { table: "memberships", filter: ownMembershipFilter },
      { table: "employee_module_permissions", filter: ownDelegatedPermissionsFilter },
      { table: "employees", filter: ownEmployeeByIdFilter || ownEmployeeFilter },
      { table: "organization_user_profiles", filter: ownProfileFilter },
      { table: "user_preferences", filter: ownPreferencesFilter },
    ];

    if (pathname.startsWith("/portal/home")) {
      subscriptions.push(
        { table: "announcements", filter: orgFilter },
        { table: "announcement_audiences", filter: orgFilter },
        { table: "documents", filter: orgFilter },
        { table: "document_folders", filter: orgFilter },
        { table: "checklist_templates", filter: orgFilter },
        { table: "scheduled_jobs", filter: checklistJobsFilter },
        { table: "checklist_submissions", filter: ownSubmissionFilter },
      );
      if (employeeId) {
        subscriptions.push({
          table: "employee_documents",
          filter: `employee_id=eq.${employeeId}`,
        });
      }
    } else if (pathname.startsWith("/portal/announcements")) {
      subscriptions.push(
        { table: "announcements", filter: orgFilter },
        { table: "announcement_audiences", filter: orgFilter },
      );
    } else if (pathname.startsWith("/portal/checklist")) {
      subscriptions.push(
        { table: "checklist_templates", filter: orgFilter },
        { table: "checklist_template_sections", filter: orgFilter },
        { table: "checklist_template_items", filter: orgFilter },
        { table: "scheduled_jobs", filter: checklistJobsFilter },
        { table: "checklist_submissions", filter: ownSubmissionFilter },
      );
    } else if (pathname.startsWith("/portal/documents")) {
      subscriptions.push(
        { table: "documents", filter: orgFilter },
        { table: "document_folders", filter: orgFilter },
      );
      if (employeeId) {
        subscriptions.push({
          table: "employee_documents",
          filter: `employee_id=eq.${employeeId}`,
        });
      }
    }

    function isEmployeeUploadCooldownActive() {
      if (typeof window === "undefined") return false;
      const raw = window.sessionStorage.getItem(employeeUploadCooldownKey);
      if (!raw) return false;
      const timestamp = Number(raw);
      if (!Number.isFinite(timestamp)) {
        window.sessionStorage.removeItem(employeeUploadCooldownKey);
        return false;
      }
      const active = Date.now() - timestamp < 8000;
      if (!active) {
        window.sessionStorage.removeItem(employeeUploadCooldownKey);
      }
      return active;
    }

    function isEmployeeUploadInflight() {
      if (typeof window === "undefined") return false;
      return window.sessionStorage.getItem(employeeUploadInflightKey) === "1";
    }

    function scheduleRefresh(sourceTable?: string) {
      if (pathname.startsWith("/portal/checklist")) {
        if (typeof window !== "undefined") {
          try {
            const raw = window.sessionStorage.getItem(CHECKLIST_PREVIEW_GUARD_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as { at?: number };
              if (typeof parsed?.at === "number" && Date.now() - parsed.at < CHECKLIST_PREVIEW_GUARD_TTL_MS) {
                return;
              }
            }
          } catch {
            // ignore guard parsing errors
          }
        }
      }

      if (isEmployeeUploadInflight()) {
        return;
      }
      if ((sourceTable === "documents" || sourceTable === "employee_documents") && isEmployeeUploadCooldownActive()) {
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const now = Date.now();
        if (now - lastRefreshAtRef.current < 1200) return;
        lastRefreshAtRef.current = now;
        router.refresh();
      }, refreshDelayMs);
    }

    const uniqueSubscriptions = new Map<string, { table: string; filter: string }>();
    for (const item of subscriptions) {
      uniqueSubscriptions.set(`${item.table}::${item.filter}`, item);
    }

    let channelBuilder = supabase.channel(`employee-shell-realtime-${organizationId}-${userId}`);
    for (const item of uniqueSubscriptions.values()) {
      channelBuilder = channelBuilder.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: item.table,
          filter: item.filter,
        },
        () => scheduleRefresh(item.table),
      );
    }

    let pollingRef: ReturnType<typeof setInterval> | null = null;

    const channel = channelBuilder.subscribe();

    if (pathname.startsWith("/portal/home") || pathname.startsWith("/portal/announcements") || pathname.startsWith("/portal/checklist") || pathname.startsWith("/portal/documents")) {
      pollingRef = setInterval(() => {
        const now = Date.now();
        if (now - lastRefreshAtRef.current < 7000) return;
        lastRefreshAtRef.current = now;
        router.refresh();
      }, 8000);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollingRef) clearInterval(pollingRef);
      supabase.removeChannel(channel);
    };
  }, [employeeId, membershipId, organizationId, pathname, realtimeAccessToken, router, userId]);

  const items = useMemo(() => {
    const result = [
      { href: "/portal/home", label: "Dashboard", icon: LayoutDashboard },
    ];
    if (enabledModules.announcements) {
      result.push({ href: "/portal/announcements", label: "Avisos", icon: Bell });
    }
    if (enabledModules.checklists) {
      result.push({ href: "/portal/checklist", label: "Checklists", icon: ClipboardList });
    }
    if (enabledModules.documents) {
      result.push({ href: "/portal/documents", label: "Documentos", icon: Folder });
    }
    if (enabledModules.onboarding) {
      result.push({ href: "/portal/onboarding", label: "Instrucciones", icon: FileText });
    }
    return result;
  }, [enabledModules.announcements, enabledModules.checklists, enabledModules.documents, enabledModules.onboarding]);

  const sidebarWidth = collapsed ? "w-[56px]" : "w-[240px]";
  const sidebarPaddingX = collapsed ? "px-2" : "px-4";

  const palette = {
    accent: "var(--gbp-accent)",
    sidebarGradient: "linear-gradient(170deg,var(--gbp-surface) 0%,var(--gbp-bg) 100%)",
    pageGradient: "linear-gradient(180deg,var(--gbp-bg) 0%,var(--gbp-bg) 45%,var(--gbp-bg2) 100%)",
    pageBg: "var(--gbp-bg)",
    headerBg: "var(--gbp-surface)",
  };

  const currentLabel = items.find(item => pathname.startsWith(item.href))?.label || "Portal";
  const brandingName = customBrandingEnabled ? (organizationName || "Empresa") : "GetBackplate";
  const effectiveCompanyLogoUrl = customBrandingEnabled ? companyLogoUrl : "";

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const item of items) {
        if (pathname.startsWith(item.href)) continue;
        if (prefetchedRoutesRef.current.has(item.href)) continue;
        prefetchedRoutesRef.current.add(item.href);
        router.prefetch(item.href);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [items, pathname, router]);

  return (
    <div data-theme="default" className="min-h-screen text-[var(--gbp-text)]" style={{ background: palette.pageGradient }}>
      <NewEmployeeModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        mode="employee_self"
        companyName={organizationName}
        branches={profileBranches}
        departments={profileDepartments}
        positions={profilePositions}
        publisherName={employeeName}
        initialEmployee={employeeProfile}
      />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--gbp-border)] transition-all duration-200 lg:sticky lg:top-0 lg:h-screen ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${sidebarWidth}`} style={{ background: palette.sidebarGradient }}>
          <div className={`relative border-b border-[var(--gbp-border)] py-3 ${sidebarPaddingX}`}>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={`absolute hidden place-items-center rounded-md bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)] lg:grid ${collapsed ? "left-1/2 top-1 h-7 w-7 -translate-x-1/2" : "right-2 top-2 h-8 w-8"}`}
              aria-label="Alternar sidebar"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
            <div className={`flex items-center justify-center ${collapsed ? "pt-8" : ""}`}>
              {customBrandingEnabled ? (
                <div className={`${collapsed ? "grid h-10 w-10 place-items-center overflow-hidden rounded-md" : "flex h-[84px] w-full items-center justify-center overflow-hidden rounded-md bg-transparent px-2"}`}>
                  {effectiveCompanyLogoUrl ? (
                    <Image
                      src={effectiveCompanyLogoUrl}
                      alt={`Logo de ${brandingName}`}
                      width={collapsed ? 44 : 300}
                      height={collapsed ? 44 : 90}
                      unoptimized
                      className={collapsed ? "h-10 w-10 object-contain object-center" : "h-[76px] w-[98%] object-contain object-center"}
                    />
                  ) : (
                    <span className={`font-bold uppercase tracking-[0.08em] ${collapsed ? "text-[10px]" : "text-xs"} text-[var(--gbp-text)]`}>
                      {collapsed ? brandingName.slice(0, 2) : brandingName}
                    </span>
                  )}
                </div>
              ) : (
                <div className={`${collapsed ? "grid h-10 w-10 place-items-center rounded-md" : ""}`}>
                  {collapsed ? (
                    <GetBackplateMark variant="light" className="h-6 w-6 translate-y-0.5" />
                  ) : (
                    <GetBackplateLogo variant="light" width={220} height={40} className={`${BRAND_SCALE.sidebarDesktopHeight} w-auto`} />
                  )}
                </div>
              )}
              <button 
                type="button" 
                onClick={() => setMenuOpen(false)} 
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto py-4">
            <p className={`mb-2 px-5 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--gbp-muted)] ${collapsed ? "text-center px-0" : ""}`}>
              {collapsed ? "..." : "Navegación"}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 border-l-[2.5px] text-sm transition ${
                      collapsed ? "justify-center px-0 py-2.5" : "px-5 py-2"
                    } ${
                      active
                        ? "bg-[var(--gbp-surface2)] font-semibold text-[var(--gbp-text)]"
                        : "border-l-transparent text-[var(--gbp-text2)] hover:border-l-[var(--gbp-border2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
                    }`}
                    style={active ? { borderLeftColor: palette.accent } : undefined}
                    onClick={() => setMenuOpen(false)}
                    onMouseEnter={() => router.prefetch(item.href)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span>{item.label}</span> : null}
                    {!collapsed && active && item.href === "/portal/documents" && docsCount > 0 && (
                      <span className="ml-auto rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {docsCount}
                      </span>
                    )}
                    {!collapsed && active && item.href === "/portal/checklist" && checklistTemplateNames.length > 0 && (
                      <span className="ml-auto rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {checklistTemplateNames.length}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className={`mt-auto border-t border-[var(--gbp-border)] py-4 ${sidebarPaddingX}`} style={{ background: palette.sidebarGradient }}>
            {!collapsed ? (
              <div className="mb-4 flex items-center gap-2.5 px-1">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-[var(--gbp-surface2)]"
                  aria-label="Abrir mi perfil"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: palette.accent }}>
                    {initials(employeeName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{employeeName}</p>
                    <p className="truncate text-[11px] text-[var(--gbp-text2)]">{employeePosition || "Empleado"}</p>
                  </div>
                </button>
              </div>
            ) : null}

            {collapsed ? (
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                className="group/tooltip relative mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"
                aria-label="Abrir mi perfil"
              >
                <User className="h-3.5 w-3.5" />
                <TooltipLabel label="Mi perfil" />
              </button>
            ) : null}

            <Link
              prefetch={false}
              href="/auth/logout"
              className={`group/tooltip relative inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] py-2 text-xs text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)] ${
                collapsed ? "h-9 w-9 p-0" : "px-2"
              }`}
            >
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed ? <span>Cerrar Sesión</span> : null}
              {collapsed && <TooltipLabel label="Cerrar Sesión" />}
            </Link>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />
        )}

        {/* Main Content Area */}
        <div className="min-w-0 flex-1 flex flex-col" style={{ background: palette.pageBg }}>
          <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-4 sm:px-8" style={{ background: palette.headerBg }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] lg:hidden"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <p className="font-serif text-lg font-bold text-[var(--gbp-text)]">{currentLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2.5 py-1 text-xs font-medium text-[var(--gbp-accent)] sm:inline shadow-sm">
                {branchName || "Sucursal"}
              </span>
              {departmentName ? (
                <span className="hidden rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 lg:inline shadow-sm">
                  {departmentName}
                </span>
              ) : null}
              <span className="hidden rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-2.5 py-1 text-xs text-[var(--gbp-accent)] sm:inline shadow-sm">
                Empleado
              </span>
            </div>
          </header>
          
          <main className="flex-1 w-full">
            <PageContent as="div" spacing="shell">{children}</PageContent>
          </main>
          
          <footer className="mt-auto flex justify-between border-t border-[var(--gbp-border)] px-6 py-4 text-[11px] text-[var(--gbp-muted)] sm:px-9" style={{ background: palette.sidebarGradient }}>
            <p className="inline-flex items-center font-semibold tracking-[0.02em] text-[var(--gbp-text2)]">
              {customBrandingEnabled ? (
                effectiveCompanyLogoUrl ? (
                  <Image
                    src={effectiveCompanyLogoUrl}
                    alt={`Logo de ${brandingName}`}
                    width={160}
                    height={36}
                    className="h-[28px] w-auto object-contain object-left"
                  />
                ) : (
                  brandingName
                )
              ) : (
                <GetBackplateLogo variant="light" width={190} height={34} className={`${BRAND_SCALE.footerHeight} w-auto`} />
              )}
            </p>
            <p>© 2026 {brandingName}</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
