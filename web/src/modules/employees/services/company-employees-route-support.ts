import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertPlanLimitForStorage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

let bucketExistsChecked = false;

export async function ensureEmployeeBucketExists() {
  if (bucketExistsChecked) return;

  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (bucket) {
    bucketExistsChecked = true;
    return;
  }

  await admin.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });

  bucketExistsChecked = true;
}

export async function rollbackEmployeeCreateFlow(input: {
  organizationId: string;
  employeeId: string;
  uploadedPaths: string[];
  uploadedDocumentIds: string[];
  linkedUserId: string | null;
  createdMembershipForLinkedUser: boolean;
  createdAuthUserId: string | null;
}) {
  const admin = createSupabaseAdminClient();

  try {
    if (input.uploadedPaths.length) {
      await admin.storage.from(BUCKET_NAME).remove(input.uploadedPaths);
    }

    if (input.uploadedDocumentIds.length) {
      await admin
        .from("document_processing_jobs")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("document_id", input.uploadedDocumentIds);

      await admin
        .from("documents")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("id", input.uploadedDocumentIds);
    }

    await admin
      .from("employee_documents")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("employee_id", input.employeeId);

    await admin
      .from("employee_contracts")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("employee_id", input.employeeId);

    await admin
      .from("employees")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("id", input.employeeId);

    if (input.createdMembershipForLinkedUser && input.linkedUserId) {
      await admin
        .from("memberships")
        .delete()
        .eq("organization_id", input.organizationId)
        .eq("user_id", input.linkedUserId);
    }

    if (input.createdAuthUserId) {
      await admin.auth.admin.deleteUser(input.createdAuthUserId);
    }
  } catch (rollbackError) {
    console.error("[rollbackEmployeeCreateFlow] Rollback failed:", rollbackError);
  }
}

export async function syncEmployeeProfileProjection(input: {
  organizationId: string;
  employeeId: string;
  userId: string | null;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeStatus: string;
}) {
  const admin = createSupabaseAdminClient();
  const normalizedProfileStatus = input.employeeStatus === "inactive" ? "inactive" : "active";

  const payload = {
    organization_id: input.organizationId,
    user_id: input.userId,
    employee_id: input.employeeId,
    branch_id: input.branchId,
    department_id: input.departmentId,
    position_id: input.positionId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    is_employee: true,
    status: normalizedProfileStatus,
    source: "users_employees_modal",
  };

  const existingByEmployee = await admin
    .from("organization_user_profiles")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("employee_id", input.employeeId)
    .maybeSingle();

  if (existingByEmployee.data?.id) {
    return admin
      .from("organization_user_profiles")
      .update(payload)
      .eq("organization_id", input.organizationId)
      .eq("id", existingByEmployee.data.id);
  }

  if (input.userId) {
    const existingByUser = await admin
      .from("organization_user_profiles")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (existingByUser.data?.id) {
      return admin
        .from("organization_user_profiles")
        .update(payload)
        .eq("organization_id", input.organizationId)
        .eq("id", existingByUser.data.id);
    }
  }

  const existingByEmail = await admin
    .from("organization_user_profiles")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("email", input.email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingByEmail.data?.id) {
    return admin
      .from("organization_user_profiles")
      .update(payload)
      .eq("organization_id", input.organizationId)
      .eq("id", existingByEmail.data.id);
  }

  return admin.from("organization_user_profiles").insert(payload);
}

export type UpsertEmployeeContractDocumentInput = {
  organizationId: string;
  companyName: string;
  actorId: string;
  employeeId: string;
  linkedUserId: string | null;
  firstName: string;
  lastName: string;
  branchId: string | null;
  branchName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionName: string | null;
  hiredAt: string | null;
  contractType: string | null;
  paymentFrequency: string | null;
  salaryAmount: number | null;
  salaryCurrency: string | null;
};

async function buildContractPdfBytes(input: {
  companyName: string;
  fullName: string;
  branchName: string;
  departmentName: string;
  positionName: string;
  hiredAtLabel: string;
  contractTypeLabel: string;
  salaryLabel: string;
  paymentFrequencyLabel: string;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 46;
  let y = 58;

  doc.setDrawColor(212, 83, 26);
  doc.setLineWidth(2);
  doc.line(margin, 36, pageWidth - margin, 36);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(18, 34, 52);
  doc.text("Contrato Laboral", margin, y);

  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(96, 109, 128);
  const generatedAt = new Intl.DateTimeFormat("es-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  doc.text(`Empresa: ${input.companyName}  |  Generado: ${generatedAt}`, margin, y);

  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(44, 55, 72);
  const body = `El presente contrato se celebra entre ${input.fullName} y la empresa ${input.companyName}, para desempeñar funciones como ${input.positionName} en ${input.branchName}, área ${input.departmentName}, con cumplimiento de las políticas internas.`;
  const bodyLines = doc.splitTextToSize(body, pageWidth - margin * 2);
  doc.text(bodyLines, margin, y);

  y += bodyLines.length * 14 + 24;

  const boxX = margin;
  const boxW = pageWidth - margin * 2;
  const boxH = 132;
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(223, 228, 236);
  doc.roundedRect(boxX, y, boxW, boxH, 10, 10, "FD");

  const leftX = boxX + 16;
  const rightX = boxX + boxW / 2 + 8;
  let rowY = y + 24;

  const drawMetaRow = (x: number, label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(96, 109, 128);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(24, 35, 54);
    doc.text(value, x, rowY + 16);
  };

  drawMetaRow(leftX, "Fecha de ingreso", input.hiredAtLabel);
  drawMetaRow(rightX, "Tipo de contrato", input.contractTypeLabel);
  rowY += 50;
  drawMetaRow(leftX, "Salario base", input.salaryLabel);
  drawMetaRow(rightX, "Frecuencia de pago", input.paymentFrequencyLabel);

  y += boxH + 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(118, 126, 141);
  doc.text("Documento generado automáticamente desde el panel de Recursos Humanos.", margin, y);

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

export async function upsertEmployeeContractDocument(input: UpsertEmployeeContractDocumentInput) {
  if (!input.linkedUserId) return;
  if (!input.hiredAt || !input.contractType || !input.paymentFrequency) return;
  if (!input.branchId || !input.departmentId || !input.positionName) return;
  if (!Number.isFinite(input.salaryAmount ?? Number.NaN) || (input.salaryAmount ?? 0) <= 0) return;

  const contractTypeLabels: Record<string, string> = {
    indefinite: "Indeterminado",
    fixed_term: "Plazo fijo",
    seasonal: "Temporada",
    internship: "Pasantía",
  };

  const paymentFrequencyLabels: Record<string, string> = {
    hora: "Por hora",
    semana: "Semanal",
    quincena: "Quincenal",
    mes: "Mensual",
  };

  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const contractTypeLabel = contractTypeLabels[input.contractType] ?? input.contractType;
  const paymentFrequencyLabel = paymentFrequencyLabels[input.paymentFrequency] ?? input.paymentFrequency;
  const salaryCurrency = input.salaryCurrency ?? "USD";
  const salaryLabel = new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: salaryCurrency,
  }).format(input.salaryAmount ?? 0);
  const hiredAtLabel = new Intl.DateTimeFormat("es-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${input.hiredAt}T00:00:00`));

  const pdfBytes = await buildContractPdfBytes({
    companyName: input.companyName,
    fullName,
    branchName: input.branchName ?? "Sin locación",
    departmentName: input.departmentName ?? "Sin departamento",
    positionName: input.positionName,
    hiredAtLabel,
    contractTypeLabel,
    salaryLabel,
    paymentFrequencyLabel,
  });

  await assertPlanLimitForStorage(input.organizationId, pdfBytes.byteLength);

  const admin = createSupabaseAdminClient();
  await ensureEmployeeBucketExists();

  const safeName = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "empleado";
  const path = `${input.organizationId}/employees/${input.employeeId}/contract-current.pdf`;

  if (!isSafeTenantStoragePath(path, input.organizationId)) {
    throw new Error("Ruta inválida para documento de contrato");
  }

  const { error: uploadError } = await admin.storage
    .from(BUCKET_NAME)
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    throw new Error(`No se pudo guardar contrato en documentos: ${uploadError.message}`);
  }

  const folderName = "Documentacion laboral";
  const folderScope = {
    locations: input.branchId ? [input.branchId] : [],
    department_ids: input.departmentId ? [input.departmentId] : [],
    users: [input.linkedUserId],
  };

  const { data: existingFolder } = await admin
    .from("document_folders")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("name", folderName)
    .contains("access_scope", { users: [input.linkedUserId] })
    .maybeSingle();

  const folderId = existingFolder?.id
    ? existingFolder.id
    : (
        await admin
          .from("document_folders")
          .insert({
            organization_id: input.organizationId,
            name: folderName,
            created_by: input.actorId,
            access_scope: folderScope,
          })
          .select("id")
          .single()
      ).data?.id;

  if (!folderId) {
    throw new Error("No se pudo crear carpeta de documentación laboral");
  }

  const { data: existingDoc } = await admin
    .from("documents")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("file_path", path)
    .maybeSingle();

  const documentPayload = {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    folder_id: folderId,
    owner_user_id: input.actorId,
    title: `Contrato Laboral - ${fullName}`,
    file_path: path,
    mime_type: "application/pdf",
    original_file_name: `contrato-laboral-${safeName}.pdf`,
    file_size_bytes: pdfBytes.byteLength,
    access_scope: folderScope,
  };

  const documentId = existingDoc?.id
    ? (
        await admin
          .from("documents")
          .update(documentPayload)
          .eq("organization_id", input.organizationId)
          .eq("id", existingDoc.id)
          .select("id")
          .single()
      ).data?.id
    : (await admin.from("documents").insert(documentPayload).select("id").single()).data?.id;

  if (!documentId) {
    throw new Error("No se pudo registrar documento de contrato");
  }

  await admin.from("employee_documents").upsert(
    {
      organization_id: input.organizationId,
      employee_id: input.employeeId,
      document_id: documentId,
      status: "approved",
      requested_without_file: false,
      pending_since_at: null,
      pending_reminder_stage: 0,
      pending_reminder_last_sent_at: null,
    },
    { onConflict: "employee_id,document_id" },
  );
}
