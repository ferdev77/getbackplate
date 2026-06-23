import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToUsers } from "./send-to-org";

export type IntegrationAlertInput =
  | {
      kind: "identification_failed";
      organizationId: string;
      entityId: string;
      entityType: string;
      errorMessage: string;
    }
  | {
      kind: "send_success";
      organizationId: string;
      customerName: string | null;
      docNumber: string | null;
    }
  | {
      kind: "send_failed";
      organizationId: string;
      customerName: string | null;
      entityId: string;
      errorMessage: string;
    };

function buildPayload(orgName: string, input: IntegrationAlertInput) {
  switch (input.kind) {
    case "identification_failed":
      return {
        title: "⚠️ No se pudo identificar un webhook",
        body: `${orgName} — ${input.entityType} #${input.entityId}: ${input.errorMessage}`,
      };
    case "send_success":
      return {
        title: "✅ Factura enviada a R365",
        body: `${input.docNumber ? `Factura ${input.docNumber}` : "Factura"} de ${input.customerName ?? "cliente"} (${orgName})`,
      };
    case "send_failed":
      return {
        title: "❌ Error enviando factura a R365",
        body: `${input.customerName ?? `Entidad ${input.entityId}`} (${orgName}): ${input.errorMessage}`,
      };
  }
}

export async function notifyIntegrationEvent(input: IntegrationAlertInput): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();

    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("notify_integration_alerts", true)
      .eq("is_active", true);
    if (subsError) throw new Error(subsError.message);

    const userIds = Array.from(new Set((subs ?? []).map((s) => String(s.user_id))));
    if (userIds.length === 0) return;

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", input.organizationId)
      .maybeSingle();
    const orgName = org?.name ?? "organización desconocida";

    const payload = buildPayload(orgName, input);
    await sendPushToUsers(userIds, { ...payload, url: "/superadmin/push" });
  } catch (err) {
    console.error("[integration-alerts] Error notificando:", err instanceof Error ? err.message : err);
  }
}
