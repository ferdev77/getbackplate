import { NextResponse } from "next/server";

import { getSubmission } from "@/infrastructure/docuseal/client";
import { mapDocusealStatus } from "@/infrastructure/docuseal/status-mapper";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
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
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("employee_documents")
    .select("signature_submission_id, signature_submitter_slug")
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId)
    .eq("document_id", documentId)
    .maybeSingle();

  if (!link?.signature_submission_id) {
    return NextResponse.json({ error: "No hay solicitud de firma activa" }, { status: 400 });
  }

  const submission = await getSubmission(link.signature_submission_id);
  const submitter = submission.submitters?.find((item) => item.slug === link.signature_submitter_slug) ?? submission.submitters?.[0];
  const signatureStatus = mapDocusealStatus(submitter?.status || submission.status);
  const completedAt = submitter?.completed_at || null;

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
}
