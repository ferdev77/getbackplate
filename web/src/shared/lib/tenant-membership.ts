import { SupabaseClient } from "@supabase/supabase-js";

export async function isUserMemberOfOrganization(params: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
}) {
  const { data, error } = await params.supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.id);
}
