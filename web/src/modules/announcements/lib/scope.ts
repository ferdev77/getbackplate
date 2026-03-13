export type AnnouncementScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function readAnnouncementScopeFromFormData(formData: FormData): AnnouncementScope {
  return {
    locations: unique(formData.getAll("location_scope").map(String)),
    department_ids: unique(formData.getAll("department_scope").map(String)),
    position_ids: unique(formData.getAll("position_scope").map(String)),
    users: unique(formData.getAll("user_scope").map(String)),
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

export function buildAnnouncementAudienceRows(
  organizationId: string,
  announcementId: string,
  scope: AnnouncementScope,
) {
  const rows: Array<{ organization_id: string; announcement_id: string; branch_id: string | null; user_id: string | null }> = [
    {
      organization_id: organizationId,
      announcement_id: announcementId,
      branch_id: null,
      user_id: null,
    },
  ];

  for (const locationId of scope.locations) {
    rows.push({
      organization_id: organizationId,
      announcement_id: announcementId,
      branch_id: locationId,
      user_id: null,
    });
  }

  for (const userId of scope.users) {
    rows.push({
      organization_id: organizationId,
      announcement_id: announcementId,
      branch_id: null,
      user_id: userId,
    });
  }

  return rows;
}
