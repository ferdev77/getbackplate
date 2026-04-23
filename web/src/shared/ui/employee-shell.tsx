"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { isDndActive } from "@/modules/documents/hooks/use-dnd-safety-net";
import { ChevronDown, LayoutDashboard, ClipboardList, Folder, Bell, FileText, FileBarChart, PanelsLeftRight, LogOut, Menu, Trash2, User, Truck, MessageSquarePlus, X, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { NewEmployeeModal, type EmployeeModalInitialData, type ModalBranch, type ModalDepartment, type ModalPosition } from "@/modules/employees/ui/new-employee-modal";
import { GetBackplateLogo } from "@/shared/ui/getbackplate-logo";
import { GetBackplateMark } from "@/shared/ui/getbackplate-mark";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";
import { PageContent } from "@/shared/ui/page-content";
import { CollapsibleSidebarNavItem } from "@/shared/ui/collapsible-sidebar-nav-item";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { FloatingAiAssistant } from "@/shared/ui/floating-ai-assistant";
import { DevClientCachePanel } from "@/shared/ui/dev-client-cache-panel";

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
    vendors: boolean;
    ai_assistant: boolean;
  };
  canDeleteDocuments: boolean;
  canCreateChecklistReports: boolean;
  canViewVendors: boolean;
  customBrandingEnabled: boolean;
  companyLogoUrl: string;
  employeeProfile: EmployeeModalInitialData;
  profileBranches: ModalBranch[];
  profileDepartments: ModalDepartment[];
  profilePositions: ModalPosition[];
  realtimeAccessToken?: string | null;
};

type EmployeeSidebarChild = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type EmployeeSidebarItem = EmployeeSidebarChild & {
  children?: EmployeeSidebarChild[];
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
  canDeleteDocuments,
  canCreateChecklistReports,
  canViewVendors,
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [fbType, setFbType] = useState<"bug" | "idea">("bug");
  const [fbTitle, setFbTitle] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const [submenuOpenByParent, setSubmenuOpenByParent] = useState<Record<string, boolean>>({
    "/portal/documents": pathname.startsWith("/portal/documents") || pathname.startsWith("/portal/trash"),
    "/portal/checklist": pathname.startsWith("/portal/checklist/reports"),
  });

  // Realtime: auto-refresh when employee portal scoped data changes
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (realtimeAccessToken) {
      supabase.realtime.setAuth(realtimeAccessToken);
    }
    const orgFilter = `organization_id=eq.${organizationId}`;
    const fastRealtimePaths = ["/portal/checklist", "/portal/home", "/portal/announcements", "/portal/documents", "/portal/trash"];
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
    } else if (pathname.startsWith("/portal/documents") || pathname.startsWith("/portal/trash")) {
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
        // Skip refresh while a drag-and-drop is active anywhere in the app
        if (isDndActive()) return;
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

    if (pathname.startsWith("/portal/home") || pathname.startsWith("/portal/announcements") || pathname.startsWith("/portal/checklist") || pathname.startsWith("/portal/documents") || pathname.startsWith("/portal/trash") || pathname.startsWith("/portal/vendors")) {
      pollingRef = setInterval(() => {
        const now = Date.now();
        if (now - lastRefreshAtRef.current < 7000) return;
        // Skip refresh while a drag-and-drop is active anywhere in the app
        if (isDndActive()) return;
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
    const result: EmployeeSidebarItem[] = [
      { href: "/portal/home", label: "Dashboard", icon: LayoutDashboard },
    ];
    if (enabledModules.announcements) {
      result.push({ href: "/portal/announcements", label: "Avisos", icon: Bell });
    }
    if (enabledModules.checklists) {
      result.push({
        href: "/portal/checklist",
        label: "Checklists",
        icon: ClipboardList,
        children: canCreateChecklistReports
          ? [{ href: "/portal/checklist/reports", label: "Reportes", icon: FileBarChart }]
          : [],
      });
    }
    if (enabledModules.documents) {
      result.push({
        href: "/portal/documents",
        label: "Documentos",
        icon: Folder,
        children: canDeleteDocuments ? [{ href: "/portal/trash", label: "Papelera", icon: Trash2 }] : [],
      });
    }
    if (enabledModules.vendors && canViewVendors) {
      result.push({ href: "/portal/vendors", label: "Proveedores", icon: Truck });
    }
    if (enabledModules.onboarding) {
      result.push({ href: "/portal/onboarding", label: "Instrucciones", icon: FileText });
    }
    return result;
  }, [canCreateChecklistReports, canDeleteDocuments, canViewVendors, enabledModules.announcements, enabledModules.checklists, enabledModules.documents, enabledModules.onboarding, enabledModules.vendors]);

  const sidebarWidth = collapsed ? "w-[56px]" : "w-[240px]";
  const sidebarPaddingX = collapsed ? "px-2" : "px-4";

  const palette = {
    accent: "var(--gbp-accent)",
    sidebarGradient: "linear-gradient(170deg,var(--gbp-surface) 0%,var(--gbp-bg) 100%)",
    pageGradient: "linear-gradient(180deg,var(--gbp-bg) 0%,var(--gbp-bg) 45%,var(--gbp-bg2) 100%)",
    pageBg: "var(--gbp-bg)",
    headerBg: "var(--gbp-surface)",
  };

  const currentLabel =
    items.find((item) =>
      pathname.startsWith(item.href) ||
      item.children?.some((child) => pathname.startsWith(child.href)),
    )?.children?.find((child) => pathname.startsWith(child.href))?.label ||
    items.find((item) => pathname.startsWith(item.href))?.label ||
    "Portal";
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

  async function sendFeedback() {
    setFeedbackBusy(true);
    try {
      const response = await fetch("/api/employee/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          feedbackType: fbType,
          title: fbTitle,
          message: fbMessage,
          pagePath: pathname,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo enviar");
      setFbTitle("");
      setFbMessage("");
      setFeedbackOpen(false);
      toast.success("Feedback enviado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al enviar feedback");
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div data-theme="default" className="min-h-screen overflow-x-clip text-[var(--gbp-text)]" style={{ background: palette.pageGradient }}>
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
      <div className="flex min-h-screen overflow-x-clip">
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

          <nav className={`min-h-0 flex-1 py-4 ${collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"}`}>
            <p className={`mb-2 px-5 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--gbp-muted)] ${collapsed ? "text-center px-0" : ""}`}>
              {collapsed ? "..." : "Navegación"}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const childActive = item.children?.some((child) => pathname.startsWith(child.href)) ?? false;
                const active = pathname.startsWith(item.href) || childActive;
                const hasChildren = Boolean(item.children?.length);
                const isExpanded = hasChildren ? (submenuOpenByParent[item.href] ?? childActive) : false;
                return (
                  <div key={item.href}>
                    <CollapsibleSidebarNavItem
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      collapsed={collapsed}
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
                      iconClassName="h-4 w-4 shrink-0"
                      rightSlot={
                        <>
                          {!collapsed && active && item.href === "/portal/documents" && docsCount > 0 ? (
                            <span className="ml-auto rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                              {docsCount}
                            </span>
                          ) : null}
                          {!collapsed && active && item.href === "/portal/checklist" && checklistTemplateNames.length > 0 ? (
                            <span className="ml-auto rounded-full bg-[var(--gbp-accent)] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                              {checklistTemplateNames.length}
                            </span>
                          ) : null}
                          {!collapsed && hasChildren ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSubmenuOpenByParent((prev) => ({
                                  ...prev,
                                  [item.href]: !(prev[item.href] ?? childActive),
                                }));
                              }}
                              className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"
                              aria-label={isExpanded ? `Ocultar submenu de ${item.label}` : `Mostrar submenu de ${item.label}`}
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`} />
                            </button>
                          ) : null}
                        </>
                      }
                    />

                    {!collapsed && hasChildren && isExpanded ? (
                      <div className="mt-0.5 space-y-0.5">
                        {item.children?.map((child) => {
                          const childIsActive = pathname.startsWith(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-2 border-l-[2.5px] py-1.5 pl-11 pr-5 text-xs transition ${
                                childIsActive
                                  ? "bg-[var(--gbp-surface2)] font-semibold text-[var(--gbp-text)]"
                                  : "border-l-transparent text-[var(--gbp-text2)] hover:border-l-[var(--gbp-border2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
                              }`}
                              style={childIsActive ? { borderLeftColor: palette.accent } : undefined}
                              onClick={() => setMenuOpen(false)}
                              onMouseEnter={() => router.prefetch(child.href)}
                            >
                              <child.icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
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
              <div className="mb-2 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"
                  aria-label="Abrir mi perfil"
                >
                  <User className="h-3.5 w-3.5" />
                  <TooltipLabel label="Mi perfil" side="right" />
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"
                  aria-label="Abrir feedback"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <TooltipLabel label="Feedback" side="right" />
                </button>
              </div>
            ) : null}

            {!collapsed ? (
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="group/tooltip relative mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] py-2 text-xs text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)] px-2"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>Feedback</span>
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
              {collapsed && <TooltipLabel label="Cerrar Sesión" side="right" />}
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
                {branchName || "Locación"}
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
      {enabledModules.ai_assistant ? (
        <FloatingAiAssistant
          currentPlanCode={null}
          userName={employeeName}
          tenantId={organizationId}
          userKey={userId}
        />
      ) : null}
      {feedbackOpen ? (
        <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/45 p-4" onClick={() => setFeedbackOpen(false)}>
          <div className="w-full max-w-[480px] rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]" onClick={(event) => event.stopPropagation()}>
            <div className="relative p-6 pb-2">
              <button type="button" onClick={() => setFeedbackOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"><X className="h-4 w-4" /></button>
              <p className="font-serif text-lg font-bold text-[var(--gbp-text)]">Feedback</p>
              <p className="text-sm text-[var(--gbp-muted)]">iAyudanos a mejorar!</p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-6 pb-4">
              <button type="button" onClick={() => setFbType("bug")} className={`rounded-[10px] border-[1.5px] px-3 py-2 text-sm font-semibold ${fbType === "bug" ? "bg-[var(--gbp-error-soft)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"}`} style={fbType === "bug" ? { borderColor: palette.accent, color: palette.accent } : undefined}>Reportar problema</button>
              <button type="button" onClick={() => setFbType("idea")} className={`rounded-[10px] border-[1.5px] px-3 py-2 text-sm font-semibold ${fbType === "idea" ? "border-[var(--gbp-accent)]/35 bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"}`}>Nueva idea / integracion</button>
            </div>
            <div className="px-6 pb-6">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Titulo del mensaje</label>
              <input value={fbTitle} onChange={(event) => setFbTitle(event.target.value)} className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]" placeholder="Resume el problema o idea en una linea..." />
              <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Descripcion detallada</label>
              <textarea value={fbMessage} onChange={(event) => setFbMessage(event.target.value)} rows={4} className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]" placeholder="Cuentanos con detalle..." />
              <button type="button" disabled={feedbackBusy || !fbTitle.trim() || !fbMessage.trim()} onClick={sendFeedback} className="mt-4 flex w-full items-center justify-center gap-2 flex-row rounded-lg px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: palette.accent }}>
                {feedbackBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {feedbackBusy ? "Enviando msj..." : "Enviar mensaje"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <DevClientCachePanel />
    </div>
  );
}
