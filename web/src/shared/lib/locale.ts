import { getOrganizationByIdCached } from "@/modules/organizations/cached-queries";
import { resolveOrganizationLocale, type AppLocale } from "@/shared/lib/locale-policy";

export {
  getFormattingLocale,
  resolveOrganizationLocale,
  type AppLocale,
  type FormattingLocale,
} from "@/shared/lib/locale-policy";

// Locale is an organization policy. userId remains in the input because this
// resolver is also used at user-specific call sites, but it is not an authority.
export async function resolveUserLocale(input: { organizationId: string; userId: string | null }): Promise<AppLocale> {
  const organization = await getOrganizationByIdCached(input.organizationId);
  return resolveOrganizationLocale(organization?.integration_plan_id);
}
