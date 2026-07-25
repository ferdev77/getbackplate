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
    }
  | {
      kind: "receipt_processing_failed";
      receiptId: string;
      status: string;
      errorMessage: string;
    };

function buildPayload(orgName: string | null, input: IntegrationAlertInput) {
  switch (input.kind) {
    case "identification_failed":
      return {
        title: "Webhook could not be identified",
        body: `${orgName}: ${input.entityType} #${input.entityId} could not be identified.`,
      };
    case "send_success":
      return {
        title: "Invoice sent to R365",
        body: `${input.docNumber ? `Invoice ${input.docNumber}` : "Invoice"} for ${input.customerName ?? "customer"} (${orgName})`,
      };
    case "send_failed":
      return {
        title: "Failed to send invoice to R365",
        body: `${input.customerName ?? `Entity ${input.entityId}`} (${orgName}): An error occurred while sending the invoice.`,
      };
    case "receipt_processing_failed":
      return {
        title: "Intuit webhook receipt could not be processed",
        body: `Receipt ${input.receiptId} (${input.status}): ${input.errorMessage}`,
      };
  }
}

export async function notifyIntegrationEvent(input: IntegrationAlertInput): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();

    const { data: superadmins, error: superadminsError } = await admin
      .from("superadmin_users")
      .select("user_id");
    if (superadminsError) throw new Error(superadminsError.message);

    const superadminIds = Array.from(new Set((superadmins ?? []).map((s) => String(s.user_id))));
    if (superadminIds.length === 0) return;

    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("is_active", true)
      .in("user_id", superadminIds);
    if (subsError) throw new Error(subsError.message);

    const userIds = Array.from(new Set((subs ?? []).map((s) => String(s.user_id))));
    if (userIds.length === 0) return;

    let orgName: string | null = null;
    if (input.kind !== "receipt_processing_failed") {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", input.organizationId)
        .maybeSingle();
      orgName = org?.name ?? "unknown organization";
    }

    const payload = buildPayload(orgName, input);
    await sendPushToUsers(userIds, { ...payload, url: "/superadmin/notifications" }, {
      source: "integration_alert",
      ...(input.kind !== "receipt_processing_failed" ? { organizationId: input.organizationId } : {}),
    });
  } catch (err) {
    console.error("[integration-alerts] Notification error:", err instanceof Error ? err.message : err);
  }
}
