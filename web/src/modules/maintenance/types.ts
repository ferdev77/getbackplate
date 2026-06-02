export const MAINTENANCE_STATUSES = [
  "draft",
  "submitted",
  "visit_scheduled",
  "in_progress",
  "needs_parts",
  "needs_followup",
  "resolved",
  "cancelled",
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_CATEGORIES = [
  { value: "plumbing", label: "Plomeria" },
  { value: "electrical", label: "Electricidad" },
  { value: "equipment", label: "Equipos" },
  { value: "cleaning", label: "Limpieza" },
  { value: "hvac", label: "HVAC" },
  { value: "safety", label: "Seguridad" },
  { value: "other", label: "Otro" },
] as const;

export type MaintenanceAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number;
  signedUrl: string | null;
  createdAt: string;
};

export type MaintenanceUpdate = {
  id: string;
  actorUserId: string;
  actorName: string;
  updateType: string;
  fromStatus: MaintenanceStatus | null;
  toStatus: MaintenanceStatus | null;
  message: string | null;
  scheduledVisitAt: string | null;
  createdAt: string;
};

export type MaintenanceRequest = {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  createdBy: string;
  title: string;
  description: string;
  category: string;
  serviceItem: string | null;
  issue: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledVisitAt: string | null;
  resolvedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  attachments: MaintenanceAttachment[];
  updates: MaintenanceUpdate[];
};
