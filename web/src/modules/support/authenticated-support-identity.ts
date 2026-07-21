import "server-only";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import type { AuthenticatedSupportIdentity } from "@/modules/support/support-request";
import { getOptionalCompanyAdminContext } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";

export type SupportIdentityResolution =
  | { kind: "anonymous" }
  | { kind: "unresolved" }
  | { kind: "error" }
  | { kind: "resolved"; identity: AuthenticatedSupportIdentity };

export async function getAuthenticatedSupportIdentity(): Promise<SupportIdentityResolution> {
  const context = await getOptionalCompanyAdminContext();
  if (context.kind !== "resolved") return { kind: context.kind };
  if (!context.user.email) return { kind: "unresolved" };

  const admin = createSupabaseAdminClient();
  const { data: organization, error } = await admin
    .from("organizations")
    .select("name, status")
    .eq("id", context.tenant.organizationId)
    .maybeSingle();
  if (error || !organization || organization.status !== "active") return { kind: "unresolved" };

  return {
    kind: "resolved",
    identity: {
      userId: context.user.id,
      organizationId: context.tenant.organizationId,
      name: extractDisplayName(context.user),
      email: context.user.email,
      company: organization.name,
    },
  };
}
