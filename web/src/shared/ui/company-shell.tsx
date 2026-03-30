"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  FolderPlus,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquarePlus,
  MapPin,
  PanelsLeftRight,
  Settings,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  User,
  X,
  Trash2
} from "lucide-react";
import { FloatingAiAssistant } from "@/shared/ui/floating-ai-assistant";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

type SettingsSnapshot = {
  billingPlan: string;
  billingPeriod: string;
  billedTo: string;
  billingEmail: string;
  paymentLast4: string;
  invoiceEmailsEnabled: boolean;
  theme: string;
  language: string;
  dateFormat: string;
  timezoneMode: string;
  timezoneManual: string;
  analyticsEnabled: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: string;
};

type CompanyShellProps = {
  organizationLabel: string;
  sessionUserName: string;
  sessionUserEmail: string;
  sessionRoleLabel: string;
  sessionAvatarUrl: string;
  tenantId: string;
  settingsSnapshot: SettingsSnapshot;
  availablePlans: Array<{
    id: string;
    code: string;
    name: string;
    priceAmount: number | null;
    billingPeriod: string | null;
    maxBranches: number | null;
    maxUsers: number | null;
    maxEmployees: number | null;
    maxStorageMb: number | null;
    stripePriceId?: string | null;
  }>;
  currentPlanCode: string | null;
  currentPlanName: string;
  companyLogoUrl: string;
  companyLogoDarkUrl: string;
  customBrandingEnabled: boolean;
  planModulesByPlanId: Record<string, Array<{ code: string; name: string }>>;
  enabledModules: string[];
  branchOptions: Array<{ id: string; name: string }>;
  impersonationMode?: boolean;
  children: React.ReactNode;
};

type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: boolean;
  moduleCode?: string;
};

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

type BillingCycle = "monthly" | "yearly";

const SECTIONS: SidebarSection[] = [
  {
    label: "Operaciones",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/app/reports", label: "Reportes Checklists", icon: ClipboardList, moduleCode: "reports" },
      { href: "/app/settings", label: "Ajustes Empresa", icon: Settings, moduleCode: "settings" },
    ],
  },
  {
    label: "File Manager",
    items: [
      { href: "/app/documents", label: "Documentos", icon: LayoutGrid, moduleCode: "documents" },
      { href: "/app/documents?action=create-folder", label: "Crear Carpeta", icon: FolderPlus, sub: true, moduleCode: "documents" },
      { href: "/app/documents?action=upload", label: "Subir Archivo", icon: Upload, sub: true, moduleCode: "documents" },
      { href: "/app/trash", label: "Papelera", icon: Trash2, moduleCode: "documents" },
    ],
  },
  {
    label: "Comunicacion",
    items: [
      { href: "/app/announcements", label: "Avisos", icon: Bell, moduleCode: "announcements" },
      { href: "/app/announcements?action=create", label: "Nuevo Aviso", icon: MessageSquarePlus, sub: true, moduleCode: "announcements" },
      { href: "/app/checklists", label: "Mis Checklists", icon: ClipboardList, moduleCode: "checklists" },
      { href: "/app/checklists/new", label: "Nuevo Checklist", icon: FilePlus2, sub: true, moduleCode: "checklists" },
    ],
  },
  {
    label: "Recursos Humanos",
    items: [
      { href: "/app/employees", label: "Usuarios / Empleados", icon: Users, moduleCode: "employees" },
      { href: "/app/employees?action=create", label: "Nuevo Usuario / Empleado", icon: UserPlus, sub: true, moduleCode: "employees" },
      { href: "/app/users", label: "Administradores", icon: User, moduleCode: "employees" },
      { href: "/app/users?action=create-user", label: "Nuevo Administrador", icon: UserPlus, sub: true, moduleCode: "employees" },
    ],
  },
];

const THEMES = [
  "dark-pro",
  "default",
  "sky",
  "turquoise",
  "teal",
  "matcha",
  "sunshine",
  "peach",
  "lilac",
  "ebony",
  "navy",
  "gray",
] as const;

const THEME_NAMES: Record<string, string> = {
  "dark-pro": "Dark Pro",
  default: "Default",
  sky: "Sky",
  turquoise: "Turquoise",
  teal: "Teal",
  matcha: "Matcha",
  sunshine: "Sunshine",
  peach: "Peach",
  lilac: "Lilac",
  ebony: "Ebony",
  navy: "Navy",
  gray: "Gray",
};

const THEME_PALETTES: Record<string, { accent: string; sidebarGradient: string; pageGradient: string; pageBg: string; headerBg: string }> = {
  "dark-pro": { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg,var(--gbp-bg2)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,color-mix(in_oklab,var(--gbp-bg)_82%,black)_55%,color-mix(in_oklab,var(--gbp-bg)_72%,black)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  default: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg,var(--gbp-bg)_0%,var(--gbp-bg2)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-bg2)_55%,color-mix(in_oklab,var(--gbp-bg2)_86%,white)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  sky: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg,var(--gbp-violet-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-violet-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  turquoise: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg,var(--gbp-success-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-success-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  teal: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg,var(--gbp-success-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-success-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  matcha: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg,var(--gbp-success-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-success-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  sunshine: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg,var(--gbp-accent-glow)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-accent-glow)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  peach: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg,var(--gbp-accent-glow)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-accent-glow)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  lilac: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg,var(--gbp-violet-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-violet-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  ebony: { accent: "var(--gbp-text)", sidebarGradient: "linear-gradient(170deg,var(--gbp-bg2)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-bg2)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  navy: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg,var(--gbp-violet-soft)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-violet-soft)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  gray: { accent: "var(--gbp-text2)", sidebarGradient: "linear-gradient(170deg,var(--gbp-bg2)_0%,var(--gbp-bg)_100%)", pageGradient: "linear-gradient(180deg,var(--gbp-bg)_0%,var(--gbp-bg2)_55%,var(--gbp-bg)_100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
};

const THEME_SWATCH_STYLE: Record<string, string> = {
  "dark-pro": "linear-gradient(145deg,var(--gbp-bg2),var(--gbp-bg))",
  default: "linear-gradient(145deg,var(--gbp-surface),var(--gbp-bg2))",
  sky: "linear-gradient(145deg,var(--gbp-violet),var(--gbp-violet-hover))",
  turquoise: "linear-gradient(145deg,var(--gbp-success),color-mix(in_oklab,var(--gbp-success)_65%,black))",
  teal: "linear-gradient(145deg,var(--gbp-success),color-mix(in_oklab,var(--gbp-success)_58%,black))",
  matcha: "linear-gradient(145deg,var(--gbp-success),color-mix(in_oklab,var(--gbp-success)_52%,black))",
  sunshine: "linear-gradient(145deg,var(--gbp-accent),var(--gbp-accent-hover))",
  peach: "linear-gradient(145deg,var(--gbp-accent),color-mix(in_oklab,var(--gbp-accent)_72%,black))",
  lilac: "linear-gradient(145deg,var(--gbp-violet-hover),var(--gbp-violet))",
  ebony: "linear-gradient(145deg,var(--gbp-text2),var(--gbp-text))",
  navy: "linear-gradient(145deg,var(--gbp-violet),color-mix(in_oklab,var(--gbp-violet)_70%,black))",
  gray: "linear-gradient(145deg,var(--gbp-text2),color-mix(in_oklab,var(--gbp-text2)_55%,black))",
};

const MODULE_LABELS: Record<string, string> = {
  announcements: "Avisos",
  checklists: "Checklists",
  documents: "Documentos",
  employees: "Usuarios y Empleados",
  reports: "Reportes",
  settings: "Ajustes",
  ai_assistant: "Asistente IA",
  dashboard: "Dashboard",
  company_portal: "Portal Empresa",
};

function isActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const cleanHref = href.split("?")[0];
  if (!(pathname === cleanHref || pathname.startsWith(`${cleanHref}/`))) {
    return false;
  }

  const query = href.split("?")[1];
  if (!query) {
    return true;
  }

  const expected = new URLSearchParams(query);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

export function CompanyShell({
  organizationLabel,
  sessionUserName,
  sessionUserEmail,
  sessionRoleLabel,
  sessionAvatarUrl,
  tenantId,
  settingsSnapshot,
  availablePlans,
  currentPlanCode,
  currentPlanName,
  companyLogoUrl,
  companyLogoDarkUrl,
  customBrandingEnabled,
  planModulesByPlanId,
  enabledModules,
  branchOptions,
  impersonationMode = false,
  children,
}: CompanyShellProps) {
  const brandingName = customBrandingEnabled ? (organizationLabel || "Empresa") : "GetBackplate";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<"main" | "profile" | "billing" | "preferences">("main");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planBillingCycle, setPlanBillingCycle] = useState<BillingCycle>("monthly");
  const [planChangeTargetId, setPlanChangeTargetId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((section) => [section.label, false])),
  );
  const [busy, setBusy] = useState(false);
  const selectedBranch = searchParams.get("branch") ?? "";

  const enabledModuleSet = useMemo(() => new Set(enabledModules), [enabledModules]);
  const visibleSections = useMemo(() => {
    return SECTIONS
      .map((section) => {
        const filteredItems = section.items.filter(
          (item) => !item.moduleCode || enabledModuleSet.has(item.moduleCode),
        );

        if (section.label !== "Operaciones" || !filteredItems.some((item) => item.href === "/app/dashboard")) {
          return { ...section, items: filteredItems };
        }

        const dashboardIndex = filteredItems.findIndex((item) => item.href === "/app/dashboard");
        if (dashboardIndex === -1) return { ...section, items: filteredItems };

        if (branchOptions.length < 2) {
          return { ...section, items: filteredItems };
        }

        const before = filteredItems.slice(0, dashboardIndex + 1);
        const after = filteredItems.slice(dashboardIndex + 1);
        const locationItems: SidebarItem[] = branchOptions.map((branch) => ({
          href: `/app/dashboard/location?branch=${branch.id}`,
          label: branch.name,
          icon: MapPin,
          sub: true,
        }));

        return {
          ...section,
          items: [...before, ...locationItems, ...after],
        };
      })
      .filter((section) => section.items.length > 0);
  }, [enabledModuleSet, branchOptions]);

  const [theme, setTheme] = useState(settingsSnapshot.theme);
  const [profileName] = useState(sessionUserName);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(sessionAvatarUrl);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState("");
  const [billingPlan, setBillingPlan] = useState(currentPlanName || settingsSnapshot.billingPlan);
  const [billingPeriod, setBillingPeriod] = useState(settingsSnapshot.billingPeriod);
  const [billedTo] = useState(settingsSnapshot.billedTo);
  const [billingEmail] = useState(settingsSnapshot.billingEmail);
  const [language, setLanguage] = useState(settingsSnapshot.language);
  const [dateFormat, setDateFormat] = useState(settingsSnapshot.dateFormat);
  const [timezoneMode, setTimezoneMode] = useState(settingsSnapshot.timezoneMode);
  const [timezoneManual, setTimezoneManual] = useState(settingsSnapshot.timezoneManual);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(settingsSnapshot.analyticsEnabled);
  const [fbType, setFbType] = useState<"bug" | "idea">("bug");
  const [fbTitle, setFbTitle] = useState("");
  const [fbMessage, setFbMessage] = useState("");
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const billingToastHandledRef = useRef(false);
  const currentPlanCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const orgFilter = `organization_id=eq.${tenantId}`;

    const subscriptions: Array<{ table: string; filter: string }> = [
      { table: "organization_modules", filter: orgFilter },
      { table: "organizations", filter: `id=eq.${tenantId}` },
    ];

    if (pathname.startsWith("/app/dashboard")) {
      subscriptions.push(
        { table: "announcements", filter: orgFilter },
        { table: "checklist_submissions", filter: orgFilter },
        { table: "checklist_flags", filter: orgFilter },
        { table: "documents", filter: orgFilter },
        { table: "branches", filter: orgFilter },
        { table: "employees", filter: orgFilter },
        { table: "organization_user_profiles", filter: orgFilter },
        { table: "memberships", filter: orgFilter },
      );
    } else if (pathname.startsWith("/app/announcements")) {
      subscriptions.push({ table: "announcements", filter: orgFilter });
    } else if (pathname.startsWith("/app/checklists")) {
      subscriptions.push(
        { table: "checklist_templates", filter: orgFilter },
        { table: "checklist_template_sections", filter: orgFilter },
        { table: "checklist_template_items", filter: orgFilter },
        { table: "scheduled_jobs", filter: orgFilter },
        { table: "checklist_submissions", filter: orgFilter },
      );
    } else if (pathname.startsWith("/app/reports")) {
      subscriptions.push(
        { table: "checklist_submissions", filter: orgFilter },
        { table: "checklist_submission_items", filter: orgFilter },
        { table: "checklist_flags", filter: orgFilter },
        { table: "checklist_item_comments", filter: orgFilter },
        { table: "checklist_item_attachments", filter: orgFilter },
        { table: "branches", filter: orgFilter },
        { table: "employees", filter: orgFilter },
        { table: "organization_user_profiles", filter: orgFilter },
      );
    } else if (pathname.startsWith("/app/documents") || pathname.startsWith("/app/trash")) {
      subscriptions.push(
        { table: "documents", filter: orgFilter },
        { table: "document_folders", filter: orgFilter },
      );
    } else if (pathname.startsWith("/app/employees") || pathname.startsWith("/app/users")) {
      subscriptions.push(
        { table: "employees", filter: orgFilter },
        { table: "memberships", filter: orgFilter },
        { table: "organization_user_profiles", filter: orgFilter },
        { table: "branches", filter: orgFilter },
        { table: "organization_departments", filter: orgFilter },
        { table: "department_positions", filter: orgFilter },
      );
    } else if (pathname.startsWith("/app/settings")) {
      subscriptions.push(
        { table: "branches", filter: orgFilter },
        { table: "organization_departments", filter: orgFilter },
        { table: "department_positions", filter: orgFilter },
        { table: "employees", filter: orgFilter },
        { table: "memberships", filter: orgFilter },
        { table: "organization_user_profiles", filter: orgFilter },
      );
    }

    function scheduleRefresh() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
      }, 350);
    }

    const uniqueSubscriptions = new Map<string, { table: string; filter: string }>();
    for (const item of subscriptions) {
      uniqueSubscriptions.set(`${item.table}::${item.filter}`, item);
    }

    let channelBuilder = supabase.channel(`company-shell-live-${tenantId}`);
    for (const item of uniqueSubscriptions.values()) {
      channelBuilder = channelBuilder.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: item.table,
          filter: item.filter,
        },
        scheduleRefresh,
      );
    }

    const channel = channelBuilder.subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [pathname, router, tenantId]);

  useEffect(() => {
    setCurrentAvatarUrl(sessionAvatarUrl);
  }, [sessionAvatarUrl]);

  useEffect(() => {
    setBillingPlan(currentPlanName || settingsSnapshot.billingPlan);
  }, [currentPlanName, settingsSnapshot.billingPlan]);

  useEffect(() => {
    if (!planOpen) return;
    const timer = setTimeout(() => {
      currentPlanCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
  }, [planOpen]);

  // Persist billing success markers from URL and clean query params first
  useEffect(() => {
    if (typeof window === "undefined") return;

    const upgraded = searchParams.get('upgraded');
    const success = searchParams.get('success');

    if (upgraded !== 'true' && success !== 'true') return;

    const toastCode = upgraded === 'true' ? 'plan-updated' : 'subscription-activated';
    window.sessionStorage.setItem('gb:billing-success-toast', toastCode);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('upgraded');
    nextParams.delete('success');

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  // Show billing success toast after the page is stable
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (billingToastHandledRef.current) return;

    const toastCode = window.sessionStorage.getItem('gb:billing-success-toast');
    if (!toastCode) return;

    billingToastHandledRef.current = true;

    const timer = setTimeout(() => {
      if (toastCode === 'plan-updated') {
        toast.success('¡Plan actualizado exitosamente! 🎉');
      } else {
        toast.success('¡Suscripción activada exitosamente! 🎉');
      }
      window.sessionStorage.removeItem('gb:billing-success-toast');
      billingToastHandledRef.current = false;
    }, 450);

    return () => {
      clearTimeout(timer);
      billingToastHandledRef.current = false;
    };
  }, [pathname]);

  const currentLabel = useMemo(() => {
    for (const section of visibleSections) {
      const found = section.items.find((item) => isActive(pathname, searchParams, item.href));
      if (found) return found.label;
    }
    return "Panel";
  }, [pathname, searchParams, visibleSections]);

  function hrefWithBranch(href: string) {
    if (!selectedBranch || !href.startsWith("/app")) return href;
    const [path, query] = href.split("?");
    const params = new URLSearchParams(query ?? "");
    if (!params.has("branch")) params.set("branch", selectedBranch);
    return `${path}?${params.toString()}`;
  }

  const isDarkTheme = theme === "dark-pro" || theme === "dark";
  const effectiveCompanyLogoUrl = customBrandingEnabled
    ? (isDarkTheme ? (companyLogoDarkUrl || companyLogoUrl) : companyLogoUrl)
    : "";
  const palette = THEME_PALETTES[theme] ?? (theme === "dark" ? THEME_PALETTES["dark-pro"] : THEME_PALETTES.default);

  const initials =
    profileName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase() ?? "")
      .join("") || "US";

  async function saveSettings(kind: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, tenantId, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar");
      toast.success("Configuración guardada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(planId: string, cycle: BillingCycle) {
    if (impersonationMode) {
      toast.error("Billing bloqueado en modo impersonación");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, billingPeriod: cycle }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error al conectar con Stripe");
      
      // Redirect out softly to Stripe Checkout URL
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falló la conexión de pagos");
      setBusy(false);
    }
  }

  function openPlanChangeDialog(planId: string) {
    if (impersonationMode) {
      toast.error("Billing bloqueado en modo impersonación");
      return;
    }
    setPlanOpen(false);
    setPlanChangeTargetId(planId);
  }

  async function openBillingPortal() {
    if (impersonationMode) {
      toast.error("Billing bloqueado en modo impersonación");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/stripe/billing-portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "No se pudo abrir el portal de pagos");
      if (!data.url) throw new Error("No se encontro URL del portal de pagos");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo abrir el portal de pagos");
      setBusy(false);
    }
  }

  async function sendFeedback() {
    setBusy(true);
    try {
      const response = await fetch("/api/company/feedback", {
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
      setBusy(false);
    }
  }

  const sidebarWidth = collapsed ? "w-[56px]" : "w-[240px]";
  const sidebarPaddingX = collapsed ? "px-2" : "px-4";
  const normalizedCurrentPlanCode = (currentPlanCode ?? "").toLowerCase();
  const plansForDisplay = useMemo(
    () => [...availablePlans].sort((a, b) => (a.priceAmount ?? 0) - (b.priceAmount ?? 0)),
    [availablePlans],
  );

  function normalizePlanPeriod(value: string | null | undefined): BillingCycle {
    return value === "yearly" || value === "annual" ? "yearly" : "monthly";
  }

  function getPlanAmountByCycle(plan: (typeof availablePlans)[number], cycle: BillingCycle) {
    if (typeof plan.priceAmount !== "number") return null;
    const sourcePeriod = normalizePlanPeriod(plan.billingPeriod);
    if (sourcePeriod === cycle) return plan.priceAmount;
    if (cycle === "yearly") return plan.priceAmount * 10;
    return Math.round((plan.priceAmount / 10) * 100) / 100;
  }

  const moduleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const modules of Object.values(planModulesByPlanId)) {
      for (const moduleItem of modules) {
        if (!map.has(moduleItem.code)) map.set(moduleItem.code, moduleItem.name);
      }
    }
    return map;
  }, [planModulesByPlanId]);

  const currentPlan = useMemo(() => {
    if (!normalizedCurrentPlanCode) return null;
    return plansForDisplay.find((plan) => plan.code.toLowerCase() === normalizedCurrentPlanCode) ?? null;
  }, [normalizedCurrentPlanCode, plansForDisplay]);

  const planChangeTarget = useMemo(() => {
    if (!planChangeTargetId) return null;
    return plansForDisplay.find((plan) => plan.id === planChangeTargetId) ?? null;
  }, [planChangeTargetId, plansForDisplay]);

  const planChangeDirection = useMemo(() => {
    if (!currentPlan || !planChangeTarget) return "upgrade" as const;
    const currentPrice = typeof currentPlan.priceAmount === "number" ? currentPlan.priceAmount : 0;
    const targetPrice = typeof planChangeTarget.priceAmount === "number" ? planChangeTarget.priceAmount : 0;
    return targetPrice < currentPrice ? ("downgrade" as const) : ("upgrade" as const);
  }, [currentPlan, planChangeTarget]);

  const planModuleDiff = useMemo(() => {
    const currentModulesFromPlan = currentPlan ? (planModulesByPlanId[currentPlan.id] ?? []) : [];
    const currentModules =
      currentModulesFromPlan.length > 0
        ? currentModulesFromPlan
        : enabledModules.map((code) => ({ code, name: MODULE_LABELS[code] || code }));
    const targetModules = planChangeTarget ? (planModulesByPlanId[planChangeTarget.id] ?? []) : [];

    const currentSet = new Set(currentModules.map((item) => item.code));
    const targetSet = new Set(targetModules.map((item) => item.code));

    const toEnable = Array.from(targetSet)
      .filter((code) => !currentSet.has(code))
      .map((code) => moduleNameByCode.get(code) || MODULE_LABELS[code] || code)
      .sort((a, b) => a.localeCompare(b));

    const toDisable = Array.from(currentSet)
      .filter((code) => !targetSet.has(code))
      .map((code) => moduleNameByCode.get(code) || MODULE_LABELS[code] || code)
      .sort((a, b) => a.localeCompare(b));

    return { toEnable, toDisable };
  }, [currentPlan, enabledModules, moduleNameByCode, planChangeTarget, planModulesByPlanId]);

  function formatPlanPrice(plan: (typeof availablePlans)[number], cycle?: BillingCycle) {
    const selectedCycle = cycle ?? normalizePlanPeriod(plan.billingPeriod);
    const amount = getPlanAmountByCycle(plan, selectedCycle);
    if (typeof amount !== "number") return "Precio no definido";
    const period = selectedCycle === "yearly" ? "ano" : "mes";
    return `$${amount}/${period}`;
  }

  function toggleSection(label: string) {
    setExpandedSections((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  }

  return (
    <div
      data-theme={isDarkTheme ? "dark-pro" : theme}
      className={`min-h-screen ${isDarkTheme ? "theme-dark-pro text-[var(--gbp-text)]" : "text-[var(--gbp-text)]"}`}
      style={{ ["--gb-accent" as string]: palette.accent, background: palette.pageGradient } as CSSProperties}
    >
      <div className="flex min-h-screen">
          <aside className={`hidden shrink-0 border-r transition-all duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${isDarkTheme ? "border-white/10" : "border-[var(--gbp-border)]"} ${sidebarWidth}`} style={{ background: palette.sidebarGradient }}>
          <div className={`border-b py-3 ${isDarkTheme ? "border-white/10" : "border-[var(--gbp-border)]"} ${sidebarPaddingX}`}>
            <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
              {customBrandingEnabled && !collapsed ? (
                <div className="flex h-[112px] flex-1 items-center justify-center overflow-hidden rounded-md bg-transparent px-2">
                  {effectiveCompanyLogoUrl ? (
                    <Image
                      src={effectiveCompanyLogoUrl}
                      alt={`Logo de ${brandingName}`}
                      width={330}
                      height={106}
                      className="h-[104px] w-[98%] object-contain object-center"
                    />
                  ) : (
                    <span className="text-xs font-bold uppercase tracking-[0.08em] text-white">{brandingName}</span>
                  )}
                </div>
              ) : (
                <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                  {effectiveCompanyLogoUrl ? (
                    <Image src={effectiveCompanyLogoUrl} alt={`Logo de ${brandingName}`} width={36} height={36} className="h-full w-full object-contain" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-[var(--gbp-accent)] text-[10px] font-bold text-white">{(brandingName || "GB").slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
              )}
              {!collapsed && !customBrandingEnabled ? (
                <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{brandingName}</p>
              ) : null}
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className={`ml-auto grid h-8 w-8 place-items-center rounded-md ${isDarkTheme ? "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white" : "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"} ${collapsed ? "ml-0" : ""}`}
                aria-label="Alternar sidebar"
              >
                <PanelsLeftRight className="h-4 w-4" />
              </button>
            </div>
            {!collapsed ? <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--gbp-muted)]">Administrador</p> : null}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto py-2">
            {visibleSections.map((section, idx) => (
              <div key={section.label}>
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label)}
                    className={`flex w-full items-center justify-between px-5 pb-1 pt-3 text-left text-[10px] font-bold uppercase tracking-[0.13em] ${isDarkTheme ? "text-white/45" : "text-black/35"}`}
                  >
                    <span>{section.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expandedSections[section.label] ? "rotate-180" : ""}`} />
                  </button>
                ) : null}
                {collapsed || expandedSections[section.label] ? (
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(pathname, searchParams, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={hrefWithBranch(item.href)}
                          className={`flex items-center gap-2.5 border-l-[2.5px] text-[13px] transition ${
                             collapsed ? "justify-center px-0 py-2.5" : item.sub ? "px-5 py-1.5 pl-7" : "px-5 py-2"
                            } ${active ? (isDarkTheme ? "bg-white/10 font-semibold text-white" : "bg-[var(--gbp-surface2)] font-semibold text-[var(--gbp-text)]") : (isDarkTheme ? "border-l-transparent text-white/65 hover:border-l-white/30 hover:bg-white/5 hover:text-white" : "border-l-transparent text-[var(--gbp-text2)] hover:border-l-[var(--gbp-border2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]")}`}
                           style={active ? { borderLeftColor: palette.accent } : undefined}
                           onClick={() => setMenuOpen(false)}
                         >
                          <item.icon className="h-4 w-4" />
                          {!collapsed ? <span>{item.label}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
                {idx < visibleSections.length - 1 ? <div className={`mx-4 mt-2 h-px ${isDarkTheme ? "bg-white/10" : "bg-black/10"} ${collapsed ? "mx-2" : ""}`} /> : null}
              </div>
            ))}

          </nav>

          <div className={`mt-auto py-3 ${sidebarPaddingX}`} style={{ background: palette.sidebarGradient }}>
            {!collapsed ? (
              <button
                type="button"
                onClick={() => {
                  setPlanBillingCycle(normalizePlanPeriod(billingPeriod));
                  setPlanOpen(true);
                }}
                disabled={impersonationMode}
                className={`mb-2.5 w-full rounded-lg border-[1.5px] px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${isDarkTheme ? "bg-white/5" : "bg-white/75"}`}
                style={{ borderColor: palette.accent }}
              >
                <div className="mb-1 flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full" style={{ background: palette.accent }} /><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-text)]">{currentPlanName}</p></div>
                <p className="text-xs font-bold" style={{ color: palette.accent }}>
                  {impersonationMode ? "Billing bloqueado" : "Upgrade Plan →"}
                </p>
              </button>
            ) : null}

            {!collapsed ? (
              <div className="mb-2 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: palette.accent }}>
                  {currentAvatarUrl ? (
                    <Image
                      src={currentAvatarUrl}
                      alt={`Avatar de ${profileName}`}
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </span>
                <div className="min-w-0">
                   <p className="truncate text-[13px] font-semibold text-[var(--gbp-text)]">{profileName}</p>
                   <p className="truncate text-[11px] text-[var(--gbp-text2)]">{sessionRoleLabel}</p>
                   <p className="truncate text-[10px] text-[var(--gbp-muted)]">{sessionUserEmail || "Sin email"}</p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
               <a href="/auth/logout" className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"} ${collapsed ? "h-9 w-9 p-0" : "px-2"}`} title="Cerrar sesion"><LogOut className="h-3.5 w-3.5" />{!collapsed ? <span>Cerrar Sesion</span> : null}</a>
               <button type="button" onClick={() => { setSettingsOpen(true); setSettingsView("main"); }} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"} ${collapsed ? "h-9 w-9 p-0" : "px-2"}`} title="Settings"><Settings className="h-3.5 w-3.5" />{!collapsed ? <span>Settings</span> : null}</button>
               <button type="button" onClick={() => setFeedbackOpen(true)} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg2)] hover:text-[var(--gbp-text)]"} ${collapsed ? "h-9 w-9 p-0" : "px-2"}`} title="Feedback"><MessageSquarePlus className="h-3.5 w-3.5" />{!collapsed ? <span>Feedback</span> : null}</button>
             </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1" style={{ background: palette.pageBg }}>
          <header className={`sticky top-0 z-30 border-b-[1.5px] ${isDarkTheme ? "border-white/10" : "border-[var(--gbp-border)]"}`} style={{ background: palette.headerBg }}>
            {impersonationMode ? (
              <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-8">
                <p className="font-semibold">Modo superadmin activo: estas operando dentro de una organizacion en modo impersonacion.</p>
                <a href="/auth/impersonation/stop" className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                  Salir de impersonacion
                </a>
              </div>
            ) : null}
            <div className="flex h-[60px] items-center justify-between gap-3 px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <button type="button" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border lg:hidden ${isDarkTheme ? "border-white/15 bg-white/5 text-white/80" : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"}`} onClick={() => setMenuOpen((prev) => !prev)} aria-label="Abrir menu">☰</button>
              <p className="font-serif text-[19px] font-bold text-[var(--gbp-text)]">{currentLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              {organizationLabel ? <span className={`hidden rounded-full border px-2.5 py-1 text-xs sm:inline ${isDarkTheme ? "border-white/15 bg-white/5 text-white/80" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"}`}>{organizationLabel}</span> : null}
              <span className={`hidden rounded-full border px-2.5 py-1 text-xs sm:inline ${isDarkTheme ? "border-[var(--gbp-violet)]/40 bg-[var(--gbp-violet-soft)] text-[var(--gbp-violet)]" : "border-[var(--gbp-accent)]/35 bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"}`}>{sessionRoleLabel}</span>
            </div>
            </div>
          </header>
          <div className="flex min-h-[calc(100vh-60px)] flex-col">
            <div className="flex-1">{children}</div>
            <footer className={`mt-auto flex items-center justify-between border-t px-6 py-4 text-[11px] sm:px-9 ${isDarkTheme ? "border-white/10 text-white/60" : "border-black/10 text-[var(--gbp-muted)]"}`} style={{ background: palette.sidebarGradient }}>
              <p className={`font-semibold tracking-[0.02em] ${isDarkTheme ? "text-white/70" : "text-[var(--gbp-text2)]"}`}>{brandingName}</p>
              <p>© 2026 {brandingName}</p>
            </footer>
          </div>
        </div>
      </div>

      {settingsOpen ? (
        <div className="fixed inset-0 z-[1200]" onClick={() => setSettingsOpen(false)}>
          <div className="absolute bottom-[185px] left-4 h-[420px] w-[300px] overflow-hidden rounded-[14px] border border-white/10 bg-[var(--gbp-surface)] text-[var(--gbp-text)] shadow-[0_12px_40px_rgba(0,0,0,.7)]" onClick={(event) => event.stopPropagation()}>
            {settingsView === "main" ? (
              <>
                <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5"><span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">Settings</span><button type="button" onClick={() => setSettingsOpen(false)} className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white/10 text-sm text-white/60 hover:bg-white/20 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>
                <div className="px-0 py-1">
                  <button type="button" onClick={() => setSettingsView("profile")} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-white/70 hover:bg-white/10 hover:text-white"><User className="h-4 w-4 opacity-70" /><span className="flex-1">Profile</span><span className="opacity-40">›</span></button>
                  <div className="my-1 h-px bg-white/10" />
                  <p className="px-3.5 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.09em] text-[var(--gbp-text2)]">Tema</p>
                  <div className="grid grid-cols-4 gap-1.5 px-3.5">
                    {THEMES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={async () => {
                          setTheme(item);
                          await saveSettings("theme", { theme: item });
                        }}
                        className="group flex flex-col items-center gap-1"
                      >
                        <span
                           className={`relative h-10 w-10 rounded-[10px] border transition group-hover:scale-105 ${item === "dark-pro" ? "border-[var(--gbp-border2)]" : "border-black/10"}`}
                           style={{ background: THEME_SWATCH_STYLE[item] }}
                        >
                          <span className={`absolute inset-0 grid place-items-center rounded-[10px] ${theme === item ? "bg-black/20 opacity-100" : "opacity-0"}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        </span>
                        <span className={`text-[9px] ${theme === item ? "font-semibold text-white/90" : "text-white/55"}`}>{THEME_NAMES[item]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {settingsView === "profile" ? (
              <div className="h-full overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5"><button type="button" onClick={() => setSettingsView("main")} className="text-xs text-white/70 hover:text-white">← Back</button><span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">Profile</span><button type="button" onClick={() => setSettingsOpen(false)} className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white/10 text-sm text-white/60 hover:bg-white/20 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>
                <div className="space-y-3 p-3.5 text-xs">
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
                    <label className="relative inline-flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-[var(--gbp-accent)] text-xl font-bold text-white">
                      {profileAvatarPreview || currentAvatarUrl ? (
                        <Image
                          src={profileAvatarPreview || currentAvatarUrl}
                          alt="Avatar"
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                          unoptimized={Boolean(profileAvatarPreview)}
                        />
                      ) : (
                        initials
                      )}
                      <span className="absolute bottom-0 right-0 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-[var(--gbp-surface)] bg-[var(--gbp-violet)] text-[10px] text-white">✎</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;

                          const previewUrl = URL.createObjectURL(file);
                          setProfileAvatarPreview(previewUrl);

                          try {
                            const fd = new FormData();
                            fd.append("avatar", file);

                            const response = await fetch("/api/company/profile/avatar", {
                              method: "POST",
                              body: fd,
                            });
                            const data = await response.json();

                            if (!response.ok) {
                              throw new Error(data.error || "No se pudo subir avatar");
                            }

                            if (typeof data.avatarUrl === "string" && data.avatarUrl) {
                              setProfileAvatarPreview(data.avatarUrl);
                              setCurrentAvatarUrl(data.avatarUrl);
                            }
                            toast.success("Avatar actualizado");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Error subiendo avatar");
                          }
                        }}
                      />
                    </label>
                    <p className="text-sm font-semibold text-white">{profileName}</p>
                    <p className="-mt-1 text-[11px] text-white/45">{sessionRoleLabel}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Account</p>
                    <div className="flex items-center justify-between border-b border-white/5 py-1.5"><span className="text-white/55">Email</span><span className="max-w-[160px] truncate text-[11px] tracking-[0.04em] text-white/45">{sessionUserEmail || "-"}</span></div>
                    <div className="flex items-center justify-between border-b border-white/5 py-1.5">
                      <span className="text-white/55">Password</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false);
                          router.push("/auth/change-password?next=%2Fapp%2Fsettings");
                        }}
                        className="rounded-md border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-violet)]"
                      >
                        Cambiar contraseña
                      </button>
                    </div>
                    <div className="mt-2">
                      <span className="text-white/55">Nombre</span>
                      <input
                        value={profileName}
                        readOnly
                        className="mt-1 w-full cursor-not-allowed rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-white/80"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {settingsView === "billing" ? (
              <div className="h-full overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5"><button type="button" onClick={() => setSettingsView("main")} className="text-xs text-white/70 hover:text-white">← Back</button><span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">Billing</span><button type="button" onClick={() => setSettingsOpen(false)} className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white/10 text-sm text-white/60 hover:bg-white/20 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>
                <div className="space-y-3 p-3.5 text-xs">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Plan</p>
                    <div className="flex items-center justify-between"><span className="text-white/55">Current Plan</span><span className="rounded-full bg-[var(--gbp-accent-glow)] px-2 py-[2px] text-[10px] font-bold text-[var(--gbp-accent)]">{billingPlan}</span></div>
                    <div className="mt-2"><span className="text-white/55">Plan asignado</span><select value={billingPlan} onChange={(event) => setBillingPlan(event.target.value)} disabled className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-white disabled:opacity-60">{plansForDisplay.map((plan) => <option key={plan.id} value={plan.name}>{plan.name}</option>)}</select></div>
                    <p className="mt-2 text-[11px] text-white/50">El cambio de plan se gestiona desde Superadmin para mantener consistencia del tenant.</p>
                    <div className="mt-2"><span className="text-white/55">Billing Period</span><div className="mt-1 flex gap-2"><label className="inline-flex items-center gap-1.5"><input type="radio" name="bp" checked={billingPeriod === "monthly"} onChange={() => setBillingPeriod("monthly")} />Monthly</label><label className="inline-flex items-center gap-1.5"><input type="radio" name="bp" checked={billingPeriod === "annual"} onChange={() => setBillingPeriod("annual")} />Annual</label></div></div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Add-ons</p>
                    <div className="flex items-center justify-between border-b border-white/5 py-1.5"><span className="text-white/55">Extra Storage</span><button type="button" onClick={() => toast.info("Próximamente")} className="rounded-md border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-violet)]">Add Storage</button></div>
                    <div className="flex items-center justify-between py-1.5"><span className="text-white/55">Extra Users</span><button type="button" onClick={() => toast.info("Próximamente")} className="rounded-md border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-violet)]">Add Users</button></div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Pago y Facturación</p>
                    <p className="text-[11px] text-white/65 mb-3">
                      Gestiona tus métodos de pago, datos de facturación y descarga tus facturas de forma segura a través del portal de Stripe.
                    </p>
                    <button
                      type="button"
                      onClick={openBillingPortal}
                      disabled={busy || impersonationMode}
                      className="w-full rounded-md bg-white px-2 py-2 font-semibold text-[var(--gbp-text)] transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Abrir Portal de Pagos
                    </button>
                    {impersonationMode ? (
                      <p className="mt-2 text-[10px] font-semibold text-amber-300">Accion bloqueada durante impersonacion.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {settingsView === "preferences" ? (
              <div className="h-full overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5"><button type="button" onClick={() => setSettingsView("main")} className="text-xs text-white/70 hover:text-white">← Back</button><span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">Preferences</span><button type="button" onClick={() => setSettingsOpen(false)} className="grid h-5.5 w-5.5 place-items-center rounded-full bg-white/10 text-sm text-white/60 hover:bg-white/20 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>
                <div className="space-y-3 p-3.5 text-xs">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Appearance</p>
                    <div className="flex items-center justify-between"><span className="text-white/55">Selected Theme</span><span className="text-white/85">{THEME_NAMES[theme] ?? "Default"}</span></div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Language & Time</p>
                    <div><span className="text-white/55">Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-white"><option value="es">Español</option><option value="en">English</option></select></div>
                    <div className="mt-2"><span className="text-white/55">Date Format</span><select value={dateFormat} onChange={(event) => setDateFormat(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-white"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div>
                    <div className="mt-2"><span className="text-white/55">Time Zone</span><div className="mt-1 space-y-1"><label className="flex items-center gap-2"><input type="radio" checked={timezoneMode === "auto"} onChange={() => setTimezoneMode("auto")} />Automatic by location</label><label className="flex items-center gap-2"><input type="radio" checked={timezoneMode === "manual"} onChange={() => setTimezoneMode("manual")} />Manual</label></div></div>
                    {timezoneMode === "manual" ? <select value={timezoneManual} onChange={(event) => setTimezoneManual(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-white"><option>America/Chicago (CST)</option><option>America/New_York (EST)</option><option>America/Los_Angeles (PST)</option><option>America/Denver (MST)</option><option>Europe/London (GMT)</option><option>Europe/Madrid (CET)</option></select> : null}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40">Privacy</p>
                    <div className="flex items-center justify-between"><span className="text-white/55">Cookie Settings</span><button type="button" onClick={() => toast.info("Administrar cookies") } className="rounded-md border border-[var(--gbp-violet)]/35 bg-[var(--gbp-violet-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-violet)]">Manage</button></div>
                    <label className="mt-2 inline-flex items-center gap-2"><input type="checkbox" checked={analyticsEnabled} onChange={(event) => setAnalyticsEnabled(event.target.checked)} /><span>Analytics</span></label>
                  </div>
                  <button type="button" disabled={busy} onClick={() => saveSettings("preferences", { theme, language, dateFormat, timezoneMode, timezoneManual, analyticsEnabled })} className="w-full rounded-md bg-white px-2 py-2 font-semibold text-[var(--gbp-text)] disabled:opacity-60">Guardar preferences</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {enabledModuleSet.has("ai_assistant") ? (
        <FloatingAiAssistant currentPlanCode={currentPlanCode} />
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
              <button type="button" disabled={busy || !fbTitle.trim() || !fbMessage.trim()} onClick={sendFeedback} className="mt-4 flex w-full items-center justify-center gap-2 flex-row rounded-lg px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: palette.accent }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Enviando msj..." : "Enviar mensaje"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planOpen ? (
        <div className="fixed inset-0 z-[1200]" onClick={() => setPlanOpen(false)}>
          <div className="absolute bottom-[72px] left-3 w-[280px] overflow-hidden rounded-[14px] border border-white/10 bg-[var(--gbp-surface)] text-white shadow-[0_12px_40px_rgba(0,0,0,.7)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">Planes Disponibles</span>
              <button type="button" onClick={() => setPlanOpen(false)} className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="px-3.5 pb-2 pt-2">
              <p className="mb-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Actual <span className="ml-2 rounded-full bg-[var(--gbp-accent-glow)] px-2 py-[2px] text-[9px] text-[var(--gbp-accent)]">{currentPlanName}</span></p>
              <p className="text-xs text-white/75">{billedTo || "-"} · {billingEmail || "-"}</p>
              <div className="mt-2 inline-flex rounded-lg border border-white/15 bg-white/[0.03] p-1 text-[10px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPlanBillingCycle("monthly")}
                  className={`rounded-md px-2.5 py-1 transition ${planBillingCycle === "monthly" ? "bg-white text-[var(--gbp-text)]" : "text-white/75 hover:text-white"}`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setPlanBillingCycle("yearly")}
                  className={`rounded-md px-2.5 py-1 transition ${planBillingCycle === "yearly" ? "bg-[var(--gbp-success)] text-white" : "text-white/75 hover:text-white"}`}
                >
                  Anual (2 meses gratis)
                </button>
              </div>
            </div>

            <div className="mx-3.5 h-px bg-white/10" />

            <div className="max-h-[280px] overflow-y-auto px-3.5 py-2">
              <div className="space-y-2">
                {plansForDisplay.map((plan) => {
                  const isCurrentPlanCode = normalizedCurrentPlanCode && normalizedCurrentPlanCode === plan.code.toLowerCase();
                  return (
                    <div
                      key={plan.id}
                      ref={isCurrentPlanCode ? currentPlanCardRef : null}
                      className={`rounded-lg border px-3 py-2 transition-all duration-300 ${isCurrentPlanCode ? "border-[var(--gbp-accent)]/40 bg-[var(--gbp-accent-glow)] shadow-[0_0_0_1px_rgba(0,0,0,.25),0_12px_28px_rgba(0,0,0,.28)] animate-[pulse_1.15s_ease-in-out_1]" : "border-white/10 bg-white/[0.03]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/80">{plan.name}</p>
                        <span className="rounded-full bg-white/10 px-2 py-[2px] text-[10px] font-semibold text-white/80">{formatPlanPrice(plan, planBillingCycle)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/60">{plan.code.toUpperCase()} · {planBillingCycle === "yearly" ? "Anual" : "Mensual"}{isCurrentPlanCode ? ` · Periodo actual: ${normalizePlanPeriod(billingPeriod) === "yearly" ? "Anual" : "Mensual"}` : ""}</p>
                      <div className="mb-2 mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-white/60">
                        <span>Sucursales: {plan.maxBranches ?? "-"}</span>
                        <span>Usuarios: {plan.maxUsers ?? "-"}</span>
                        <span>Empleados: {plan.maxEmployees ?? "-"}</span>
                        <span>Storage MB: {plan.maxStorageMb ?? "-"}</span>
                      </div>
                      <button
                        type="button"
                        disabled={busy || !plan.stripePriceId}
                        onClick={() => openPlanChangeDialog(plan.id)}
                        className="mt-2 w-full rounded-md border border-white/20 bg-white/5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                      >
                        {busy ? "Procesando..." : isCurrentPlanCode ? "Cambiar periodicidad o mantener" : "Elegir Plan"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mx-3.5 mb-3 mt-2 grid gap-2" />
          </div>
        </div>
      ) : null}

      {planChangeTarget ? (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/65 px-4 backdrop-blur-[2px]" onClick={() => setPlanChangeTargetId(null)}>
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[var(--gbp-surface)] text-white shadow-[0_30px_90px_rgba(0,0,0,.58)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`h-1.5 w-full ${planChangeDirection === "downgrade" ? "bg-[linear-gradient(90deg,var(--gbp-accent),color-mix(in_oklab,var(--gbp-accent)_75%,black))]" : "bg-[linear-gradient(90deg,var(--gbp-success),color-mix(in_oklab,var(--gbp-success)_72%,black))]"}`} />

            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ring-inset ${planChangeDirection === "downgrade" ? "bg-amber-500/20 text-amber-300 ring-amber-300/35" : "bg-emerald-500/20 text-emerald-300 ring-emerald-300/35"}`}>
                  {planChangeDirection === "downgrade" ? <AlertTriangle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-base font-semibold leading-tight">
                    {planChangeDirection === "downgrade" ? "Confirmar cambio a un plan menor" : "¡Excelente! Estas por subir de plan"}
                  </p>
                  <p className="mt-0.5 text-xs text-white/65">Revisa el impacto antes de confirmar el cambio.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlanChangeTargetId(null)}
                className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-white/45">Plan actual</p>
                  <p className="mt-1 text-lg font-bold text-white">{currentPlan?.name ?? currentPlanName}</p>
                  <p className="mt-1 text-xs text-white/60">{currentPlan ? formatPlanPrice(currentPlan) : "Precio no definido"}</p>
                </div>
                <div className={`rounded-xl border p-4 ${planChangeDirection === "downgrade" ? "border-amber-300/35 bg-amber-500/10" : "border-emerald-300/35 bg-emerald-500/10"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-white/55">Plan destino</p>
                  <p className="mt-1 text-lg font-bold text-white">{planChangeTarget.name}</p>
                  <p className="mt-1 text-xs text-white/70">{formatPlanPrice(planChangeTarget, planBillingCycle)} · {planBillingCycle === "yearly" ? "Facturacion anual" : "Facturacion mensual"}</p>
                </div>
              </div>

              {planChangeDirection === "downgrade" ? (
                <div className="rounded-xl border border-amber-300/25 bg-amber-500/[0.08] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-amber-300">Impacto del downgrade</p>
                  <p className="mb-3 text-sm text-white/80">Si confirmas, estos modulos pueden quedar desactivados en tu empresa:</p>
                  {planModuleDiff.toDisable.length ? (
                    <div className="flex flex-wrap gap-2">
                      {planModuleDiff.toDisable.map((name) => (
                        <span key={name} className="rounded-full border border-amber-200/45 bg-[var(--gbp-accent-glow)] px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/75">No se detectaron desactivaciones de modulos para este cambio.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/[0.08] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-emerald-300">Impacto del upgrade</p>
                  <p className="mb-3 text-sm text-white/80">¡Felicidades! Al confirmar, tu equipo ganara estas capacidades:</p>
                  {planModuleDiff.toEnable.length ? (
                    <div className="flex flex-wrap gap-2">
                      {planModuleDiff.toEnable.map((name) => (
                        <span key={name} className="rounded-full border border-emerald-200/45 bg-[var(--gbp-success-soft)] px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/75">Este cambio mejora limites del plan aunque no agregue nuevos modulos visibles.</p>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPlanChangeTargetId(null)}
                  className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white"
                >
                  Mantener plan
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void startCheckout(planChangeTarget.id, planBillingCycle);
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,.35)] disabled:opacity-50 ${planChangeDirection === "downgrade" ? "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--gbp-accent)_70%,black),var(--gbp-accent))] hover:opacity-95" : "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--gbp-success)_70%,black),var(--gbp-success))] hover:opacity-95"}`}
                >
                  {busy
                    ? "Procesando..."
                    : planChangeDirection === "downgrade"
                      ? "Cambiar igual"
                      : "Subir plan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button type="button" className="h-full w-full bg-black/35" onClick={() => setMenuOpen(false)} aria-label="Cerrar menu" />
          <aside className={`absolute left-0 top-0 flex h-full w-[280px] flex-col border-r ${isDarkTheme ? "border-white/10 text-[var(--gbp-text)]" : "border-black/10 text-[var(--gbp-text)]"}`} style={{ background: palette.sidebarGradient }}>
            <div className={`border-b px-4 py-3 ${isDarkTheme ? "border-white/10" : "border-black/10"}`}>
              {customBrandingEnabled ? (
                <div className="mb-1 flex h-[114px] items-center overflow-hidden rounded-md border border-white/10 bg-transparent px-2">
                  {effectiveCompanyLogoUrl ? (
                    <Image
                      src={effectiveCompanyLogoUrl}
                      alt={`Logo de ${brandingName}`}
                      width={340}
                      height={108}
                      className="h-[106px] w-[98%] object-contain object-center"
                    />
                  ) : (
                    <p className="w-full text-center text-xs font-bold uppercase tracking-[0.08em] text-white">{brandingName}</p>
                  )}
                </div>
              ) : (
                <div className="mb-1 flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border border-black/10 bg-white">
                    {effectiveCompanyLogoUrl ? (
                      <Image src={effectiveCompanyLogoUrl} alt={`Logo de ${brandingName}`} width={36} height={36} className="h-full w-full object-contain" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-[var(--gbp-text)] text-[10px] font-bold text-white">{(brandingName || "GB").slice(0, 2).toUpperCase()}</span>
                    )}
                  </span>
                  <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{brandingName}</p>
                </div>
              )}
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gbp-muted)]">Administrador</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {visibleSections.map((section, idx) => (
                <div key={section.label}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label)}
                    className={`flex w-full items-center justify-between px-4 pb-1 pt-3 text-left text-[10px] font-bold uppercase tracking-[0.13em] ${isDarkTheme ? "text-white/45" : "text-black/35"}`}
                  >
                    <span>{section.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expandedSections[section.label] ? "rotate-180" : ""}`} />
                  </button>
                  {expandedSections[section.label] ? (
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const active = isActive(pathname, searchParams, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={hrefWithBranch(item.href)}
                            className={`flex items-center gap-2.5 border-l-[2.5px] px-4 text-[13px] transition ${item.sub ? "py-1.5 pl-6" : "py-2"} ${active ? (isDarkTheme ? "bg-white/10 font-semibold text-white" : "bg-black/5 font-semibold text-[var(--gbp-text)]") : (isDarkTheme ? "border-l-transparent text-white/65 hover:border-l-white/30 hover:bg-white/5 hover:text-white" : "border-l-transparent text-black/60 hover:border-l-black/20 hover:bg-black/5 hover:text-black/85")}`}
                            style={active ? { borderLeftColor: palette.accent } : undefined}
                            onClick={() => setMenuOpen(false)}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                  {idx < visibleSections.length - 1 ? <div className={`mx-4 mt-2 h-px ${isDarkTheme ? "bg-white/10" : "bg-black/10"}`} /> : null}
                </div>
              ))}
            </div>
            <div className={`mt-auto border-t px-4 py-3 ${isDarkTheme ? "border-white/10" : "border-black/10"}`}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: palette.accent }}>
                  {currentAvatarUrl ? (
                    <Image
                      src={currentAvatarUrl}
                      alt={`Avatar de ${profileName}`}
                      width={36}
                      height={36}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--gbp-text)]">{profileName}</p>
                  <p className="truncate text-[11px] text-[var(--gbp-text2)]">{sessionRoleLabel}</p>
                  <p className="truncate text-[10px] text-[var(--gbp-muted)]">{sessionUserEmail || "Sin email"}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setPlanBillingCycle(normalizePlanPeriod(billingPeriod));
                  setPlanOpen(true);
                }}
                disabled={impersonationMode}
                className={`mb-2.5 w-full rounded-lg border-[1.5px] px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${isDarkTheme ? "bg-white/5" : "bg-white/75"}`}
                style={{ borderColor: palette.accent }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: palette.accent }} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-text)]">{currentPlanName}</p>
                </div>
                <p className="text-xs font-bold" style={{ color: palette.accent }}>
                  {impersonationMode ? "Billing bloqueado" : "Upgrade Plan →"}
                </p>
              </button>

              <div className="space-y-1.5">
                <a
                  href="/auth/logout"
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-black/10 bg-black/5 text-[var(--gbp-text2)] hover:bg-black/10 hover:text-[var(--gbp-text)]"}`}
                  title="Cerrar sesion"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Cerrar Sesion</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                    setSettingsView("main");
                  }}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-black/10 bg-black/5 text-[var(--gbp-text2)] hover:bg-black/10 hover:text-[var(--gbp-text)]"}`}
                  title="Settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs ${isDarkTheme ? "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white" : "border-black/10 bg-black/5 text-[var(--gbp-text2)] hover:bg-black/10 hover:text-[var(--gbp-text)]"}`}
                  title="Feedback"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span>Feedback</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
