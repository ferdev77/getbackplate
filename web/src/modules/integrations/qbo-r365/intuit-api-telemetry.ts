import "server-only";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { hashQboRealmId } from "@/modules/integrations/qbo-r365/crypto";

export type IntuitResponseTelemetry = {
  organizationId?: string | null;
  runId?: string | null;
  realmId?: string | null;
  operation: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ok: boolean;
  intuitTid: string | null;
  durationMs: number;
};

export function extractIntuitTid(headers: Headers) {
  const value = headers.get("intuit_tid") ?? headers.get("intuit-tid");
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.slice(0, 255) : null;
}

export async function recordIntuitApiResponse(input: IntuitResponseTelemetry) {
  if (process.env.NODE_ENV === "test") return;

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("intuit_api_response_logs").insert({
      organization_id: input.organizationId ?? null,
      run_id: input.runId ?? null,
      realm_id_hash: input.realmId ? hashQboRealmId(input.realmId) : null,
      operation: input.operation.slice(0, 120),
      endpoint: input.endpoint.slice(0, 120),
      http_method: input.method.toUpperCase().slice(0, 12),
      status_code: input.statusCode,
      is_success: input.ok,
      intuit_tid: input.intuitTid,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
    });
    if (error) console.error("[Intuit telemetry] Unable to persist response metadata", error.message);
  } catch (error) {
    console.error("[Intuit telemetry] Response metadata capture failed", error instanceof Error ? error.message : error);
  }
}
