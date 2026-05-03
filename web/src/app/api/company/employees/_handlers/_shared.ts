import { z } from "zod";
import { ensureEmployeeBucketExists } from "@/modules/employees/services/company-employees-route-support";

export const ALLOWED_CREATE_MODES = new Set(["without_account", "with_account"]);
export const ALLOWED_CONTRACT_STATUSES = new Set(["draft", "active", "ended", "cancelled"]);
export const ALLOWED_EMPLOYMENT_STATUSES = new Set(["active", "inactive", "vacation", "leave"]);
export const ALLOWED_DOCUMENT_TYPES = new Set(["dni", "cuil", "ssn", "passport"]);
export const BUCKET_NAME = "tenant-documents";
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

export type DirectoryMembershipUser = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roleCode: string;
  status: string;
  branchId: string | null;
  branchName: string;
  createdAt: string;
};

export const EMPLOYEE_DOCUMENT_SLOT_RULES: Array<{ slot: string; prefix: string }> = [
  { slot: "photo", prefix: "Foto del Empleado - " },
  { slot: "id", prefix: "ID / Identificacion - " },
  { slot: "ssn", prefix: "SSN / EAD - " },
  { slot: "ssn", prefix: "Numero de Seguro Social - " },
  { slot: "rec1", prefix: "Food Handler Certificate - " },
  { slot: "rec2", prefix: "Alcohol Server Certificate - " },
  { slot: "other", prefix: "Food Protection Manager - " },
  { slot: "rec1", prefix: "Carta de Recomendacion 1 - " },
  { slot: "rec2", prefix: "Carta de Recomendacion 2 - " },
  { slot: "other", prefix: "Otro Documento - " },
];

export function resolveDocumentSlotFromTitle(title: string | null | undefined) {
  if (!title) return null;
  return EMPLOYEE_DOCUMENT_SLOT_RULES.find((rule) => title.startsWith(rule.prefix))?.slot ?? null;
}

export const emailSchema = z.string().email();
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DOCUMENT_SLOT_LABELS: Record<string, string> = {
  photo: "Foto del Empleado",
  id: "ID / Identificacion",
  ssn: "SSN / EAD",
  rec1: "Food Handler Certificate",
  rec2: "Alcohol Server Certificate",
  other: "Food Protection Manager",
};

export async function ensureBucketExists() {
  await ensureEmployeeBucketExists();
}
