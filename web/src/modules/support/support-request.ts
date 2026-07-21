import { z } from "zod";

export const supportRequestSchema = z.object({
  requestType: z.enum(["support", "access", "correction", "export", "deletion"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  company: z.string().trim().max(160).optional().default(""),
  details: z.string().trim().min(10).max(5000),
  website: z.string().max(200).optional().default(""),
  identityOrganizationId: z.string().uuid().optional(),
  identityUserId: z.string().uuid().optional(),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

export type AuthenticatedSupportIdentity = {
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  company: string;
};

export function supportIdentityMatchesForm(
  input: SupportRequestInput,
  identity: AuthenticatedSupportIdentity,
) {
  return input.identityOrganizationId === identity.organizationId
    && input.identityUserId === identity.userId;
}

export function resolveSupportRequester(
  input: SupportRequestInput,
  identity: AuthenticatedSupportIdentity | null,
) {
  if (!identity) {
    return {
      name: input.name,
      email: input.email,
      company: input.company,
      organizationId: null,
      userId: null,
      identitySource: "public" as const,
      authenticatedAt: null,
    };
  }

  return {
    name: identity.name,
    email: identity.email.toLowerCase(),
    company: identity.company,
    organizationId: identity.organizationId,
    userId: identity.userId,
    identitySource: "authenticated" as const,
    authenticatedAt: new Date().toISOString(),
  };
}

export function escapeSupportText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
