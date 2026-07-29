import { normalizeScopeSelection } from "@/shared/lib/scope-validation";

export type AnnouncementScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

export function readAnnouncementScopeFromFormData(formData: FormData): AnnouncementScope {
  return {
    locations: normalizeScopeSelection(formData.getAll("location_scope").map(String), { allowAllToken: true }),
    department_ids: normalizeScopeSelection(formData.getAll("department_scope").map(String), { allowAllToken: true }),
    position_ids: normalizeScopeSelection(formData.getAll("position_scope").map(String), { allowAllToken: true }),
    users: normalizeScopeSelection(formData.getAll("user_scope").map(String), { allowAllToken: true }),
  };
}

export function parseAnnouncementScope(value: unknown): AnnouncementScope {
  const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const readList = (key: keyof AnnouncementScope) => {
    const raw = input[key];
    return Array.isArray(raw)
      ? raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];
  };

  return {
    locations: readList("locations"),
    department_ids: readList("department_ids"),
    position_ids: readList("position_ids"),
    users: readList("users"),
  };
}

// buildAnnouncementAudienceRows fue eliminado el 2026-07-29. Escribia una copia
// desnormalizada de target_scope en announcement_audiences, y siempre incluia
// una fila comodin (branch_id y user_id en null) que can_read_announcement daba
// por cumplida para cualquier lector: el filtro nunca restringio nada. Verificado
// sobre datos reales de produccion y desarrollo antes de quitarlo. La unica
// fuente de verdad del alcance de un aviso es target_scope.
