import { NextResponse } from "next/server";

import { getSubmission } from "@/infrastructure/docuseal/client";
import {
  mapDocusealStatus,
  shouldKeepCurrentSignatureStatus,
} from "@/infrastructure/docuseal/status-mapper";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const payload = (await request.json().catch(() => null)) as {
    employeeId?: string;
    documentId?: string;
  } | null;

  const employeeId = String(payload?.employeeId ?? "").trim();
  const documentId = String(payload?.documentId ?? "").trim();
  if (!employeeId || !documentId) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("employee_documents")
    .select("signature_status, signature_submission_id, signature_submitter_slug")
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId)
    .eq("document_id", documentId)
    .maybeSingle();

  if (!link?.signature_submission_id) {
    return NextResponse.json({ error: "No hay solicitud de firma activa" }, { status: 400 });
  }

  try {
    const submission = await getSubmission(link.signature_submission_id);
    const submitter = submission.submitters?.find((item) => item.slug === link.signature_submitter_slug) ?? submission.submitters?.[0];
    const incomingStatus = mapDocusealStatus(submitter?.status || submission.status);
    const signatureStatus = shouldKeepCurrentSignatureStatus(link.signature_status, incomingStatus)
      ? (link.signature_status ?? incomingStatus)
      : incomingStatus;
    const completedAt = signatureStatus === "completed" ? (submitter?.completed_at || null) : null;

    await admin
      .from("employee_documents")
      .update({
        signature_status: signatureStatus,
        signature_completed_at: completedAt,
        signature_error: signatureStatus === "failed" ? "No se pudo resolver estado en DocuSeal" : null,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", employeeId)
      .eq("document_id", documentId);

    return NextResponse.json({
      ok: true,
      signatureStatus,
      signatureCompletedAt: completedAt,
      signedDocumentUrl: submitter?.documents?.[0]?.url || submission.documents?.[0]?.url || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar estado de firma" },
      { status: 400 },
    );
  }
}
