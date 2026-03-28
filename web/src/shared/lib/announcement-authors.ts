import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

type AuthorRow = {
  user_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

function resolveDisplayName(value: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const fullName = `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim();
  if (fullName) return fullName;
  if (value.email && value.email.includes("@")) {
    return value.email.split("@")[0] ?? value.email;
  }
  return "Direccion";
}

export async function resolveAnnouncementAuthorNames(params: {
  organizationId: string;
  authorIds: string[];
}) {
  const authorNameMap = new Map<string, string>();
  if (!params.authorIds.length) return authorNameMap;

  const admin = createSupabaseAdminClient();

  const [{ data: employeesData }, { data: profilesData }] = await Promise.all([
    admin
      .from("employees")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", params.authorIds),
    admin
      .from("organization_user_profiles")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", params.authorIds),
  ]);

  for (const row of (employeesData ?? []) as AuthorRow[]) {
    if (row.user_id) authorNameMap.set(row.user_id, resolveDisplayName(row));
  }

  for (const row of (profilesData ?? []) as AuthorRow[]) {
    if (row.user_id && !authorNameMap.has(row.user_id)) {
      authorNameMap.set(row.user_id, resolveDisplayName(row));
    }
  }

  const missingIds = params.authorIds.filter((id) => !authorNameMap.has(id));

  if (missingIds.length) {
    const users = await Promise.all(
      missingIds.map(async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data.user) return null;
        return { userId, user: data.user };
      }),
    );

    for (const item of users) {
      if (!item) continue;
      const meta = item.user.user_metadata as Record<string, unknown> | null;
      const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
      if (fullName) {
        authorNameMap.set(item.userId, fullName);
        continue;
      }
      if (item.user.email && item.user.email.includes("@")) {
        authorNameMap.set(item.userId, item.user.email.split("@")[0] ?? item.user.email);
      }
    }
  }

  return authorNameMap;
}
