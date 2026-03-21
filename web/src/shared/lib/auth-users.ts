import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function getAuthEmailByUserId(userIds: string[]) {
  const targetIds = new Set(userIds.filter(Boolean));
  const emailByUserId = new Map<string, string>();

  if (!targetIds.size) {
    return emailByUserId;
  }

  const admin = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (targetIds.size > 0) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;

    for (const user of data.users) {
      if (!targetIds.has(user.id)) continue;
      if (user.email) {
        emailByUserId.set(user.id, user.email);
      }
      targetIds.delete(user.id);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return emailByUserId;
}
