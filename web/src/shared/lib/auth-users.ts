import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

const EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;

type EmailCacheEntry = {
  email: string;
  fetchedAt: number;
};

const emailCache = new Map<string, EmailCacheEntry>();

export async function getAuthEmailByUserId(userIds: string[]) {
  const now = Date.now();
  const targetIds = new Set(userIds.filter(Boolean));
  const emailByUserId = new Map<string, string>();

  if (!targetIds.size) {
    return emailByUserId;
  }

  for (const userId of [...targetIds]) {
    const cached = emailCache.get(userId);
    if (!cached) continue;
    if (now - cached.fetchedAt > EMAIL_CACHE_TTL_MS) {
      emailCache.delete(userId);
      continue;
    }
    emailByUserId.set(userId, cached.email);
    targetIds.delete(userId);
  }

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
        emailCache.set(user.id, { email: user.email, fetchedAt: now });
      }
      targetIds.delete(user.id);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return emailByUserId;
}
