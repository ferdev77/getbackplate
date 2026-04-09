import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { normalizeCustomDomainInput } from "@/shared/lib/custom-domains";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const requestSchema = z.object({
  domain: z.string().trim().min(3).max(190),
});

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dominio invalido" }, { status: 400 });
  }

  const domain = normalizeCustomDomainInput(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: "Dominio invalido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("organization_domains")
    .select("id, status")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .eq("domain", domain)
    .maybeSingle();

  if (!target?.id) {
    return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 });
  }

  if (target.status !== "active") {
    return NextResponse.json({ error: "Solo dominios activos pueden ser principales" }, { status: 400 });
  }

  await supabase
    .from("organization_domains")
    .update({ is_primary: false, updated_by: moduleAccess.userId })
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .neq("id", target.id);

  const { error } = await supabase
    .from("organization_domains")
    .update({ is_primary: true, updated_by: moduleAccess.userId })
    .eq("id", target.id)
    .eq("organization_id", moduleAccess.tenant.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "custom_domain.activate",
    entityType: "organization_domain",
    entityId: target.id,
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: { domain },
  });

  return NextResponse.json({ ok: true });
}
