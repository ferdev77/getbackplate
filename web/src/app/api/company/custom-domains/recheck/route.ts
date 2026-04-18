import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { invalidateCustomDomainCaches, normalizeCustomDomainInput } from "@/shared/lib/custom-domains";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { inspectDomainInVercel } from "@/modules/settings/services/custom-domain.service";

const requestSchema = z.object({
  domain: z.string().trim().min(3).max(190),
});

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });
  }

  const domain = normalizeCustomDomainInput(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("organization_domains")
    .select("id, verified_at")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .eq("domain", domain)
    .maybeSingle();

  if (!existing?.id) {
    return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 });
  }

  let status = "pending_dns";
  let verificationError: string | null = null;
  let dnsTarget: string | null = null;

  try {
    const result = await inspectDomainInVercel(domain);
    status = result.status;
    verificationError = result.verificationError;
    dnsTarget = result.dnsTarget;
  } catch (error) {
    status = "error";
    verificationError = error instanceof Error ? error.message : "Error de verificación";
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("organization_domains")
    .update({
      status,
      verification_error: verificationError,
      dns_target: dnsTarget,
      // Preserve the original first-verification timestamp: only set it the
      // first time the domain becomes active, never overwrite it afterwards.
      verified_at: existing.verified_at ?? (status === "active" ? nowIso : null),
      activated_at: status === "active" ? nowIso : null,
      last_checked_at: nowIso,
      updated_by: moduleAccess.userId,
    })
    .eq("id", existing.id);

  await logAuditEvent({
    action: "custom_domain.verify",
    entityType: "organization_domain",
    entityId: existing.id,
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: status === "error" ? "error" : "success",
    severity: "low",
    metadata: {
      domain,
      status,
      verification_error: verificationError,
    },
  });

  invalidateCustomDomainCaches({
    organizationId: moduleAccess.tenant.organizationId,
    domain,
  });

  return NextResponse.json({
    ok: true,
    domain,
    status,
    verificationError,
    dnsTarget,
  });
}
