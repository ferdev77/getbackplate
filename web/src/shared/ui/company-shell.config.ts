import type React from "react";
import {
  Bell,
  ClipboardList,
  FilePlus2,
  FolderPlus,
  LayoutGrid,
  Link2,
  MessageSquarePlus,
  Settings,
  Trash2,
  Truck,
  Upload,
  User,
  UserPlus,
  Users,
} from "lucide-react";

import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

export type SidebarItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: boolean;
  moduleCode?: string;
  isBranch?: boolean;
  branchId?: string;
  actionKey?:
    | "openAnnouncementModal"
    | "openChecklistModal"
    | "openDocumentFolderModal"
    | "openDocumentUploadModal"
    | "openEmployeeModal"
    | "openUserModal";
};

export type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

export type AnnouncementModalCatalog = {
  publisherName: string;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
};

export type ChecklistModalCatalog = {
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
};

export type DocumentsModalCatalog = {
  folders: Array<{ id: string; name: string }>;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  recentDocuments: Array<{ id: string; title: string; branch_id: string | null; created_at: string }>;
};

export type EmployeesModalCatalog = {
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: Array<{ id: string; department_id: string; name: string; is_active: boolean }>;
  publisherName: string;
  companyName: string;
};

export type UsersModalCatalog = {
  branches: BranchOption[];
  roleOptions: Array<{ value: string; label: string }>;
};

export const ANNOUNCEMENT_CATALOG_TTL_MS = 60_000;
export const CHECKLIST_CATALOG_TTL_MS = 60_000;
export const DOCUMENTS_CATALOG_TTL_MS = 60_000;
export const EMPLOYEES_CATALOG_TTL_MS = 60_000;
export const USERS_CATALOG_TTL_MS = 30_000;

export const SECTIONS: SidebarSection[] = [
  {
    label: "Operaciones",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: LayoutGrid, moduleCode: "dashboard" },
      { href: "/app/settings", label: "Ajustes Empresa", icon: Settings, moduleCode: "settings" },
    ],
  },
  {
    label: "Checklist",
    items: [
      { href: "/app/reports", label: "Reportes Checklists", icon: ClipboardList, moduleCode: "reports" },
      { href: "/app/checklists", label: "Mis Checklists", icon: ClipboardList, moduleCode: "checklists" },
      {
        href: "/app/checklists/new",
        label: "Nuevo Checklist",
        icon: FilePlus2,
        sub: true,
        moduleCode: "checklists",
        actionKey: "openChecklistModal",
      },
    ],
  },
  {
    label: "Comunicacion",
    items: [
      { href: "/app/announcements", label: "Avisos", icon: Bell, moduleCode: "announcements" },
      {
        href: "/app/announcements?action=create",
        label: "Nuevo Aviso",
        icon: MessageSquarePlus,
        sub: true,
        moduleCode: "announcements",
        actionKey: "openAnnouncementModal",
      },
    ],
  },
  {
    label: "File Manager",
    items: [
      { href: "/app/documents", label: "Documentos", icon: LayoutGrid, moduleCode: "documents" },
      {
        href: "/app/documents?action=create-folder",
        label: "Crear Carpeta",
        icon: FolderPlus,
        sub: true,
        moduleCode: "documents",
        actionKey: "openDocumentFolderModal",
      },
      {
        href: "/app/documents?action=upload",
        label: "Subir Archivo",
        icon: Upload,
        sub: true,
        moduleCode: "documents",
        actionKey: "openDocumentUploadModal",
      },
      { href: "/app/trash", label: "Papelera", icon: Trash2, sub: true, moduleCode: "documents" },
    ],
  },
  {
    label: "Proveedores",
    items: [{ href: "/app/vendors", label: "Proveedores", icon: Truck, sub: true, moduleCode: "vendors" }],
  },
  {
    label: "Integraciones",
    items: [
      { href: "/app/integrations/quickbooks", label: "Integración QuickBooks", icon: Link2, moduleCode: "qbo_r365" },
    ],
  },
  {
    label: "Recursos Humanos",
    items: [
      { href: "/app/employees", label: "Usuarios / Empleados", icon: Users, moduleCode: "employees" },
      {
        href: "/app/employees?action=create",
        label: "Nuevo Usuario / Empleado",
        icon: UserPlus,
        sub: true,
        moduleCode: "employees",
        actionKey: "openEmployeeModal",
      },
      { href: "/app/users", label: "Administradores", icon: User, moduleCode: "employees" },
      {
        href: "/app/users?action=create-user",
        label: "Nuevo Administrador",
        icon: UserPlus,
        sub: true,
        moduleCode: "employees",
        actionKey: "openUserModal",
      },
    ],
  },
];

export const THEMES = [
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

export const THEME_DEFAULT = "default";
export const THEME_DARK_PRO = "dark-pro";

export const THEME_NAMES: Record<string, string> = {
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

export const THEME_PALETTES: Record<string, { accent: string; sidebarGradient: string; pageGradient: string; pageBg: string; headerBg: string }> = {
  "dark-pro": { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg, var(--gbp-bg2) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, color-mix(in oklab, var(--gbp-bg) 82%, black) 55%, color-mix(in oklab, var(--gbp-bg) 72%, black) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  default: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg, var(--gbp-bg) 0%, var(--gbp-bg2) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-bg2) 55%, color-mix(in oklab, var(--gbp-bg2) 86%, white) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  sky: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg, var(--gbp-violet-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-violet-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  turquoise: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg, var(--gbp-success-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-success-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  teal: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg, var(--gbp-success-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-success-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  matcha: { accent: "var(--gbp-success)", sidebarGradient: "linear-gradient(170deg, var(--gbp-success-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-success-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  sunshine: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg, var(--gbp-accent-glow) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-accent-glow) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  peach: { accent: "var(--gbp-accent)", sidebarGradient: "linear-gradient(170deg, var(--gbp-accent-glow) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-accent-glow) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  lilac: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg, var(--gbp-violet-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-violet-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  ebony: { accent: "var(--gbp-text)", sidebarGradient: "linear-gradient(170deg, var(--gbp-bg2) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-bg2) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  navy: { accent: "var(--gbp-violet)", sidebarGradient: "linear-gradient(170deg, var(--gbp-violet-soft) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-violet-soft) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
  gray: { accent: "var(--gbp-text2)", sidebarGradient: "linear-gradient(170deg, var(--gbp-bg2) 0%, var(--gbp-bg) 100%)", pageGradient: "linear-gradient(180deg, var(--gbp-bg) 0%, var(--gbp-bg2) 55%, var(--gbp-bg) 100%)", pageBg: "var(--gbp-bg)", headerBg: "var(--gbp-surface)" },
};

export const THEME_SWATCH_STYLE: Record<string, string> = {
  "dark-pro": "linear-gradient(145deg, #1f2533, #0d0f14)",
  default: "linear-gradient(145deg, #f2f3f9, #e5e7f0)",
  sky: "linear-gradient(145deg, #6c47ff, #9b82ff)",
  turquoise: "linear-gradient(145deg, #22c55e, #0f9a47)",
  teal: "linear-gradient(145deg, #1fbf6b, #0e8748)",
  matcha: "linear-gradient(145deg, #2bb85f, #157b3f)",
  sunshine: "linear-gradient(145deg, #e06030, #d4531a)",
  peach: "linear-gradient(145deg, #d86131, #a84316)",
  lilac: "linear-gradient(145deg, #7b5cff, #5a3ce6)",
  ebony: "linear-gradient(145deg, #4b5563, #111827)",
  navy: "linear-gradient(145deg, #4f46e5, #1e3a8a)",
  gray: "linear-gradient(145deg, #b4bcc9, #7f8897)",
};
