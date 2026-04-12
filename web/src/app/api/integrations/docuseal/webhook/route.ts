import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { mapDocusealStatus } from "@/infrastructure/docuseal/status-mapper";
import { logAuditEvent } from "@/shared/lib/audit";

const DOCUSEAL_WEBHOOK_SECRET = process.env.DOCUSEAL_WEBHOOK_SECRET || "";

/**
 * Compara el secret del header contra el configurado usando timingSafeEqual
 * para prevenir timing attacks. Acepta tres formatos de header que DocuSeal
 * puede utilizar según la versión / configuración del webhook.
 */
function isAuthorized(request: Request): boolean {
  if (!DOCUSEAL_WEBHOOK_SECRET) return false;

  const expected = Buffer.from(DOCUSEAL_WEBHOOK_SECRET);

  const candidates = [
    // DocuSeal: Authorization: Bearer <secret>
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
    // DocuSeal custom header
    request.headers.get("x-webhook-secret") ?? "",
    // Header custom configurado en este proyecto
    request.headers.get("gbp-firma-docs") ?? "",
  ];

  return candidates.some((candidate) => {
    const buf = Buffer.from(candidate);
    // timingSafeEqual requiere misma longitud; si difiere retornamos false
    if (buf.length !== expected.length) return false;
    return timingSafeEqual(buf, expected);
  });
}

function extractSubmissionId(
  payload: Record<string, unknown>,
): number | null {
  const direct = payload.submission_id;
  if (typeof direct === "number" && Number.isFinite(direct))
    return Math.trunc(direct);
  if (typeof direct === "string" && direct.trim())
    return Number.parseInt(direct, 10);

  const nestedSubmission = payload.submission as
    | Record<string, unknown>
    | undefined;
  if (nestedSubmission?.id && typeof nestedSubmission.id === "number")
    return Math.trunc(nestedSubmission.id);
  if (nestedSubmission?.id && typeof nestedSubmission.id === "string")
    return Number.parseInt(nestedSubmission.id, 10);

  if (typeof payload.id === "number" && Number.isFinite(payload.id))
    return Math.trunc(payload.id);
  if (typeof payload.id === "string" && payload.id.trim())
    return Number.parseInt(payload.id, 10);

  return null;
}

function extractStatus(payload: Record<string, unknown>): string | null {
  if (typeof payload.status === "string") return payload.status;
  const submission = payload.submission as
    | Record<string, unknown>
    | undefined;
  if (submission && typeof submission.status === "string")
    return submission.status;
  const submitter = payload.submitter as
    | Record<string, unknown>
    | undefined;
  if (submitter && typeof submitter.status === "string")
    return submitter.status;
  if (typeof payload.event_type === "string") return payload.event_type;
  return null;
}

function extractCompletedAt(payload: Record<string, unknown>): string | null {
  if (typeof payload.completed_at === "string") return payload.completed_at;
  const submitter = payload.submitter as
    | Record<string, unknown>
    | undefined;
  if (submitter && typeof submitter.completed_at === "string")
    return submitter.completed_at;
  const submission = payload.submission as
    | Record<string, unknown>
    | undefined;
  if (submission && typeof submission.completed_at === "string")
    return submission.completed_at;
  return null;
}

/** Extrae el event_id único del payload para idempotencia */
function extractEventId(payload: Record<string, unknown>): string {
  const id =
    payload.event_id ??
    payload.uuid ??
    (payload.submission as Record<string, unknown> | undefined)?.uuid ??
    "";
  return String(id).trim();
}

export async function POST(request: Request) {
  // 1. Autenticación
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parsear body
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // 3. Extraer submission_id
  const submissionId = extractSubmissionId(payload);
  if (!submissionId || !Number.isFinite(submissionId)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "submission_id_missing",
    });
  }

  const admin = createSupabaseAdminClient();

  // 4. Idempotencia: ignorar eventos ya procesados
  const eventId = extractEventId(payload);
  if (eventId) {
    const { data: existing } = await admin
      .from("employee_documents")
      .select("signature_last_webhook_event_id")
      .eq("signature_submission_id", submissionId)
      .maybeSingle();

    if (existing?.signature_last_webhook_event_id === eventId) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "duplicate_event",
      });
    }
  }

  // 5. Mapear status
  const signatureStatus = mapDocusealStatus(extractStatus(payload));
  const completedAt =
    signatureStatus === "completed"
      ? extractCompletedAt(payload) || new Date().toISOString()
      : null;

  // 6. Buscar registros afectados
  const { data: affectedRows } = await admin
    .from("employee_documents")
    .select("organization_id, employee_id, document_id")
    .eq("signature_submission_id", submissionId);

  if (!affectedRows || affectedRows.length === 0) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "submission_not_linked",
    });
  }

  // 7. Actualizar estado + guardar event_id para idempotencia futura
  const { error: updateError } = await admin
    .from("employee_documents")
    .update({
      signature_status: signatureStatus,
      signature_completed_at: completedAt,
      signature_error:
        signatureStatus === "failed"
          ? "DocuSeal webhook status not recognized"
          : null,
      ...(eventId ? { signature_last_webhook_event_id: eventId } : {}),
    })
    .eq("signature_submission_id", submissionId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 },
    );
  }

  // 8. Auditoría por cada registro afectado
  for (const row of affectedRows) {
    await logAuditEvent({
      action: `employee_document.signature.${signatureStatus}`,
      entityType: "employee_document",
      entityId: row.document_id,
      organizationId: row.organization_id,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        employee_id: row.employee_id,
        document_id: row.document_id,
        signature_submission_id: submissionId,
        webhook_event_id: eventId || null,
        source: "docuseal.webhook",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    updated: affectedRows.length,
    signatureStatus,
    submissionId,
  });
}
