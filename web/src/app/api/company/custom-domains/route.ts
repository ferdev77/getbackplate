import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import {
  normalizeCustomDomainInput,
  DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET,
  invalidateCustomDomainCaches,
} from "@/shared/lib/custom-domains";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  registerDomainInVercel,
  removeDomainFromVercel,
} from "@/modules/settings/services/custom-domain.service";

const requestSchema = z.object({
  domain: z.string().trim().min(3).max(190),
});

async function assertCustomBrandingModuleEnabled(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("is_module_enabled", {
    org_id: organizationId,
    module_code: "custom_branding",
  });

  return Boolean(data);
}

function domainPayloadStatus(status: string) {
  if (status === "active") return "Activo";
  if (status === "verifying_ssl") return "Verificando SSL";
  if (status === "error") return "Error";
  if (status === "disabled") return "Deshabilitado";
  return "Pendiente DNS";
}

export async function GET() {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_domains")
    .select("id, domain, status, is_primary, dns_target, verification_error, verified_at, activated_at, last_checked_at")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    cnameTarget: DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET,
    rows: (data ?? []).map((row) => ({
      ...row,
      statusLabel: domainPayloadStatus(row.status),
    })),
  });
}

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const customBrandingEnabled = await assertCustomBrandingModuleEnabled(moduleAccess.tenant.organizationId);
  if (!customBrandingEnabled) {
    return NextResponse.json(
      { error: "El módulo Custom Branding debe estar activo para configurar dominios personalizados." },
      { status: 403 },
    );
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

  if (!domain.startsWith("app.")) {
    return NextResponse.json({ error: "Usa formato app.tudominio.com" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: existingDomain } = await supabase
    .from("organization_domains")
    .select("id, domain")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .limit(1)
    .maybeSingle();

  if (existingDomain?.id) {
    return NextResponse.json(
      {
        error:
          "Tu empresa ya tiene un dominio personalizado configurado. Elimínalo primero para cargar uno nuevo.",
      },
      { status: 409 },
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("organization_domains")
    .insert({
      organization_id: moduleAccess.tenant.organizationId,
      domain,
      status: "pending_dns",
      is_primary: true,
      dns_target: DEFAULT_CUSTOM_DOMAIN_CNAME_TARGET,
      provider: "vercel",
      created_by: moduleAccess.userId,
      updated_by: moduleAccess.userId,
      last_checked_at: new Date().toISOString(),
    })
    .select("id, domain")
    .single();

  if (insertError) {
    return NextResponse.json({ error: `No se pudo registrar dominio: ${insertError.message}` }, { status: 400 });
  }

  let vercelResult;
  try {
    vercelResult = await registerDomainInVercel(domain);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error Vercel";
    await supabase
      .from("organization_domains")
      .update({
        status: "error",
        verification_error: message,
        updated_by: moduleAccess.userId,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", created.id);

    await logAuditEvent({
      action: "custom_domain.create",
      entityType: "organization_domain",
      entityId: created.id,
      organizationId: moduleAccess.tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: {
        domain,
        error: message,
      },
    });

    return NextResponse.json({ error: `No se pudo registrar dominio en Vercel: ${message}` }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("organization_domains")
    .update({
      status: vercelResult.status,
      verification_error: vercelResult.verificationError,
      dns_target: vercelResult.dnsTarget,
      verified_at: vercelResult.status === "active" ? nowIso : null,
      activated_at: vercelResult.status === "active" ? nowIso : null,
      last_checked_at: nowIso,
      updated_by: moduleAccess.userId,
    })
    .eq("id", created.id);

  await logAuditEvent({
    action: "custom_domain.create",
    entityType: "organization_domain",
    entityId: created.id,
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: {
      domain,
      status: vercelResult.status,
      dns_target: vercelResult.dnsTarget,
    },
  });

  invalidateCustomDomainCaches({
    organizationId: moduleAccess.tenant.organizationId,
    domain,
  });

  return NextResponse.json({
    ok: true,
    domain,
    status: vercelResult.status,
    statusLabel: domainPayloadStatus(vercelResult.status),
    dnsTarget: vercelResult.dnsTarget,
    verificationError: vercelResult.verificationError,
  });
}

export async function DELETE(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const { searchParams } = new URL(request.url);
  const domain = normalizeCustomDomainInput(searchParams.get("domain"));
  if (!domain) {
    return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("organization_domains")
    .select("id, domain, is_primary")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .eq("domain", domain)
    .maybeSingle();

  if (existingError || !existing?.id) {
    return NextResponse.json({ error: "Dominio no encontrado" }, { status: 404 });
  }

  try {
    await removeDomainFromVercel(domain);
  } catch {
    // Keep DB cleanup even if Vercel already detached.
  }

  const { error: deleteError } = await supabase
    .from("organization_domains")
    .delete()
    .eq("id", existing.id)
    .eq("organization_id", moduleAccess.tenant.organizationId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "custom_domain.disable",
    entityType: "organization_domain",
    entityId: existing.id,
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: { domain, was_primary: existing.is_primary },
  });

  invalidateCustomDomainCaches({
    organizationId: moduleAccess.tenant.organizationId,
    domain,
  });

  return NextResponse.json({ ok: true });
}
