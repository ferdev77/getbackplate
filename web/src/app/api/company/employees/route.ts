import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { EMPLOYEES_MESSAGES, employeesStorageLimitForSlot } from "@/shared/lib/employees-messages";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import {
  assertPlanLimitForEmployees,
  assertPlanLimitForStorage,
  assertPlanLimitForUsers,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { provisionOrganizationUserAccount } from "@/shared/lib/user-provisioning.service";

const ALLOWED_CREATE_MODES = new Set(["without_account", "with_account"]);
const ALLOWED_CONTRACT_STATUSES = new Set(["draft", "active", "ended", "cancelled"]);
const ALLOWED_EMPLOYMENT_STATUSES = new Set(["active", "inactive", "vacation", "leave"]);
const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

const emailSchema = z.string().email();
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DOCUMENT_SLOT_LABELS: Record<string, string> = {
  photo: "Foto del Empleado",
  id: "ID / Identificacion",
  ssn: "Numero de Seguro Social",
  rec1: "Food Handler Certificate",
  rec2: "Alcohol Server Certificate",
  other: "Food Protection Manager",
};

let bucketExistsChecked = false;

async function ensureBucketExists() {
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

async function rollbackEmployeeCreateFlow(input: {
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

type UpsertEmployeeContractDocumentInput = {
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
  const generatedAt = new Intl.DateTimeFormat("es-ES", {
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

async function upsertEmployeeContractDocument(input: UpsertEmployeeContractDocumentInput) {
  if (!input.linkedUserId) return;
  if (!input.hiredAt || !input.contractType || !input.paymentFrequency) return;
  if (!input.branchId || !input.departmentId || !input.positionName) return;
  if (!Number.isFinite(input.salaryAmount ?? NaN) || (input.salaryAmount ?? 0) <= 0) return;

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
  const salaryLabel = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: salaryCurrency,
  }).format(input.salaryAmount ?? 0);
  const hiredAtLabel = new Intl.DateTimeFormat("es-ES", {
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
  await ensureBucketExists();

  const safeName = fullName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "empleado";
  const path = `${input.organizationId}/employees/${input.employeeId}/contract-current.pdf`;

  if (!isSafeTenantStoragePath(path, input.organizationId)) {
    throw new Error("Ruta invalida para documento de contrato");
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
    : (
        await admin.from("documents").insert(documentPayload).select("id").single()
      ).data?.id;

  if (!documentId) {
    throw new Error("No se pudo registrar documento de contrato");
  }

  await admin.from("employee_documents").upsert(
    {
      organization_id: input.organizationId,
      employee_id: input.employeeId,
      document_id: documentId,
      status: "approved",
    },
    { onConflict: "employee_id,document_id" },
  );
}

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const formData = await request.formData();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const positionId = String(formData.get("position_id") ?? "").trim() || null;
  let position = String(formData.get("position") ?? "").trim() || null;
  let departmentId = String(formData.get("department_id") ?? "").trim() || null;
  let department = String(formData.get("department") ?? "").trim() || null;
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  let branchName: string | null = null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const employmentStatusInput = String(
    formData.get("employment_status") ?? formData.get("status") ?? "",
  ).trim();
  const hiredAt = String(formData.get("hired_at") ?? formData.get("hire_date") ?? "").trim() || null;
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const isEmployeeProfile = String(formData.get("is_employee") ?? "yes").trim().toLowerCase() !== "no";
  const organizationUserProfileId = String(formData.get("organization_user_profile_id") ?? "").trim() || null;
  const existingDashboardAccess =
    String(formData.get("existing_dashboard_access") ?? "no").trim().toLowerCase() === "yes";
  const employeeId = String(formData.get("employee_id") ?? "").trim() || null;
  const isEditMode = Boolean(employeeId);
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");

  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const nationality = String(formData.get("nationality") ?? "").trim() || null;
  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim() || null;
  const addressLine1 = String(formData.get("address_line1") ?? formData.get("address") ?? "").trim() || null;
  const addressCity = String(formData.get("address_city") ?? "").trim() || null;
  const addressState = String(formData.get("address_state") ?? "").trim() || null;
  const addressPostalCode = String(formData.get("address_postal_code") ?? "").trim() || null;
  const addressCountry = String(formData.get("address_country") ?? "").trim() || null;
  const emergencyName = String(formData.get("emergency_contact_name") ?? "").trim() || null;
  const emergencyPhone = String(formData.get("emergency_contact_phone") ?? "").trim() || null;
  const emergencyEmail = String(formData.get("emergency_contact_email") ?? "").trim() || null;

  const contractType = String(formData.get("contract_type") ?? "").trim() || null;
  const contractStatus = String(formData.get("contract_status") ?? "draft").trim() || "draft";
  const contractStart = String(formData.get("contract_start_date") ?? "").trim() || null;
  const contractEnd = String(formData.get("contract_end_date") ?? "").trim() || null;
  const salaryAmountRaw = String(formData.get("salary_amount") ?? "").trim();
  const salaryCurrency = String(formData.get("salary_currency") ?? "").trim() || null;
  const paymentFrequency = String(formData.get("payment_frequency") ?? "").trim() || null;
  const contractNotes = String(formData.get("contract_notes") ?? "").trim() || null;
  const contractSignerName = String(formData.get("contract_signer_name") ?? "").trim() || null;
  const contractSignedAt = String(formData.get("contract_signed_at") ?? "").trim() || null;

  const { data: organizationRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", tenant.organizationId)
    .maybeSingle();
  const companyName = organizationRow?.name ?? "la empresa";

  const selectedDocIds = formData
    .getAll("employee_document_id")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const uniqueDocIds = Array.from(new Set(selectedDocIds));

  const uploadFiles: Array<{
    slotKey: string;
    file: File;
    slotLabel: string;
    analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  }> = [];
  for (const [slotKey, slotLabel] of Object.entries(DOCUMENT_SLOT_LABELS)) {
    const file = formData.get(`document_file_${slotKey}`);
    if (file instanceof File && file.size > 0) {
      try {
        const analysis = await analyzeUploadedFile(file);
        uploadFiles.push({ slotKey, slotLabel, file, analysis });
      } catch (error) {
        return NextResponse.json(
          { error: `${slotLabel}: ${error instanceof Error ? error.message : "archivo invalido"}` },
          { status: 400 },
        );
      }
    }
  }

  const customDocumentTitles = formData
    .getAll("custom_document_title")
    .map((value) => String(value ?? "").trim());
  const customDocumentFiles = formData.getAll("custom_document_file");

  for (let index = 0; index < customDocumentFiles.length; index += 1) {
    const file = customDocumentFiles[index];
    if (!(file instanceof File) || file.size <= 0) continue;

    const rawTitle = customDocumentTitles[index] ?? "";
    const slotLabel = rawTitle || `Documento Adicional ${index + 1}`;

    try {
      const analysis = await analyzeUploadedFile(file);
      uploadFiles.push({
        slotKey: `custom_${index + 1}`,
        slotLabel,
        file,
        analysis,
      });
    } catch (error) {
      return NextResponse.json(
        { error: `${slotLabel}: ${error instanceof Error ? error.message : "archivo invalido"}` },
        { status: 400 },
      );
    }
  }

  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json(
      { error: "Nombre, apellido, telefono y email son obligatorios" },
      { status: 400 },
    );
  }

  if (!isEditMode && !ALLOWED_CREATE_MODES.has(createMode)) {
    return NextResponse.json({ error: "Modo de creacion invalido" }, { status: 400 });
  }

  if (email && !emailSchema.safeParse(email).success) {
    return NextResponse.json({ error: "Email de empleado invalido" }, { status: 400 });
  }

  if (accountEmailInput && !emailSchema.safeParse(accountEmailInput).success) {
    return NextResponse.json({ error: "Email de acceso invalido" }, { status: 400 });
  }

  for (const dateValue of [hiredAt, birthDate, contractStart, contractEnd, contractSignedAt]) {
    if (dateValue && !dateOnlySchema.safeParse(dateValue).success) {
      return NextResponse.json({ error: "Formato de fecha invalido (usa YYYY-MM-DD)" }, { status: 400 });
    }
  }

  if (!ALLOWED_CONTRACT_STATUSES.has(contractStatus)) {
    return NextResponse.json({ error: "Estado de contrato invalido" }, { status: 400 });
  }

  const normalizedEmploymentStatus = employmentStatusInput || "active";
  if (employmentStatusInput && !ALLOWED_EMPLOYMENT_STATUSES.has(normalizedEmploymentStatus)) {
    return NextResponse.json({ error: "Estado laboral invalido" }, { status: 400 });
  }

  if (!isEditMode && isEmployeeProfile) {
    try {
      await assertPlanLimitForEmployees(tenant.organizationId, 1);
    } catch (error) {
      return NextResponse.json(
        {
          error: getPlanLimitErrorMessage(
            error,
            EMPLOYEES_MESSAGES.PLAN_LIMIT_EMPLOYEES,
          ),
        },
        { status: 400 },
      );
    }
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      return NextResponse.json({ error: "Locacion no valida para esta empresa" }, { status: 400 });
    }

    branchName = branch.name;
  }

  if (departmentId) {
    const { data: departmentRow, error: departmentError } = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (departmentError || !departmentRow) {
      return NextResponse.json({ error: "Departamento no valido para esta empresa" }, { status: 400 });
    }

    department = departmentRow.name;
  }

  if (positionId) {
    const { data: positionRow, error: positionError } = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", positionId)
      .eq("is_active", true)
      .maybeSingle();

    if (positionError || !positionRow) {
      return NextResponse.json({ error: "Puesto no valido para esta empresa" }, { status: 400 });
    }

    if (departmentId && departmentId !== positionRow.department_id) {
      return NextResponse.json({ error: "El puesto no pertenece al departamento seleccionado" }, { status: 400 });
    }

    departmentId = positionRow.department_id;
    position = positionRow.name;

    const { data: posDepRow, error: posDepError } = await supabase
      .from("organization_departments")
      .select("name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (posDepError || !posDepRow) {
      return NextResponse.json({ error: "Departamento no valido para el puesto seleccionado" }, { status: 400 });
    }

    department = posDepRow.name;
  }

  if (!isEmployeeProfile) {
    const admin = createSupabaseAdminClient();
    let linkedUserId: string | null = null;

    if (organizationUserProfileId) {
      const { data: existingProfile } = await admin
        .from("organization_user_profiles")
        .select("user_id")
        .eq("organization_id", tenant.organizationId)
        .eq("id", organizationUserProfileId)
        .maybeSingle();

      if (!existingProfile) {
        return NextResponse.json({ error: "Usuario no encontrado para editar" }, { status: 404 });
      }

      linkedUserId = existingProfile.user_id;
    }

    if (createMode === "with_account") {
      const loginEmail = accountEmailInput || email || "";
      const needsProvision = !linkedUserId || !existingDashboardAccess;

      if (needsProvision) {
        const provisionResult = await provisionOrganizationUserAccount({
          admin,
          organizationId: tenant.organizationId,
          loginEmail,
          accountPassword,
          firstName,
          lastName,
        });

        if (!provisionResult.ok) {
          return NextResponse.json({ error: provisionResult.error }, { status: 400 });
        }

        linkedUserId = provisionResult.userId;
      }

      if (!linkedUserId) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED }, { status: 400 });
      }

      const { data: role, error: roleError } = await admin
        .from("roles")
        .select("id")
        .eq("code", "employee")
        .single();

      if (roleError || !role) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
      }

      const { data: existingMembership } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("user_id", linkedUserId)
        .maybeSingle();

      if (!existingMembership) {
        try {
          await assertPlanLimitForUsers(tenant.organizationId, 1);
        } catch (error) {
          return NextResponse.json(
            { error: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) },
            { status: 400 },
          );
        }
      }

      const { error: membershipError } = await admin.from("memberships").upsert(
        {
          organization_id: tenant.organizationId,
          user_id: linkedUserId,
          role_id: role.id,
          branch_id: branchId,
          status: "active",
        },
        { onConflict: "organization_id,user_id" },
      );

      if (membershipError) {
        return NextResponse.json({ error: `No se pudo asignar acceso al usuario: ${membershipError.message}` }, { status: 400 });
      }


    }

    const profilePayload = {
      organization_id: tenant.organizationId,
      user_id: linkedUserId,
      employee_id: null,
      branch_id: branchId,
      department_id: departmentId,
      position_id: positionId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      is_employee: false,
      status: createMode === "with_account" ? "active" : "inactive",
      source: "users_employees_modal",
    };

    const profileResult = organizationUserProfileId
      ? await admin
          .from("organization_user_profiles")
          .update(profilePayload)
          .eq("organization_id", tenant.organizationId)
          .eq("id", organizationUserProfileId)
          .select("id")
          .single()
      : await admin.from("organization_user_profiles").insert(profilePayload).select("id").single();

    if (profileResult.error) {
      return NextResponse.json({ error: `No se pudo guardar perfil de usuario: ${profileResult.error.message}` }, { status: 400 });
    }

    const profileId = organizationUserProfileId || profileResult.data?.id || null;

    if (uploadFiles.length) {
      if (!linkedUserId) {
        return NextResponse.json(
          { error: "Para cargar documentos a un usuario sin perfil de empleado, primero habilita su cuenta de acceso." },
          { status: 400 },
        );
      }

      await ensureBucketExists();

      const uploadedPaths: string[] = [];
      const uploadedDocumentIds: string[] = [];

      for (const upload of uploadFiles) {
        try {
          await assertPlanLimitForStorage(tenant.organizationId, upload.file.size);
        } catch (error) {
          if (uploadedPaths.length) {
            await admin.storage.from(BUCKET_NAME).remove(uploadedPaths);
          }
          if (uploadedDocumentIds.length) {
            await admin
              .from("documents")
              .delete()
              .eq("organization_id", tenant.organizationId)
              .in("id", uploadedDocumentIds);
          }
          return NextResponse.json(
            {
              error: getPlanLimitErrorMessage(
                error,
                employeesStorageLimitForSlot(upload.slotLabel),
              ),
            },
            { status: 400 },
          );
        }

        const path = `${tenant.organizationId}/users/${profileId ?? linkedUserId}/${Date.now()}-${upload.slotKey}-${upload.analysis.safeName}`;
        if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
          return NextResponse.json({ error: `Ruta invalida para ${upload.slotLabel}` }, { status: 400 });
        }

        const { error: uploadError } = await admin.storage
          .from(BUCKET_NAME)
          .upload(path, upload.file, {
            contentType: upload.analysis.normalizedMime,
            upsert: false,
          });

        if (uploadError) {
          return NextResponse.json({ error: `No se pudo subir ${upload.slotLabel}: ${uploadError.message}` }, { status: 400 });
        }

        uploadedPaths.push(path);

        const { data: createdDoc, error: createDocError } = await admin
          .from("documents")
          .insert({
            organization_id: tenant.organizationId,
            branch_id: branchId,
            owner_user_id: actorId,
            title: `${upload.slotLabel} - ${firstName} ${lastName}`,
            file_path: path,
            mime_type: upload.analysis.normalizedMime,
            original_file_name: upload.analysis.originalName,
            checksum_sha256: upload.analysis.checksumSha256,
            file_size_bytes: upload.file.size,
            access_scope: {
              locations: branchId ? [branchId] : [],
              department_ids: departmentId ? [departmentId] : [],
              users: [linkedUserId],
              internal_only: true,
            },
          })
          .select("id")
          .single();

        if (createDocError || !createdDoc) {
          if (uploadedPaths.length) {
            await admin.storage.from(BUCKET_NAME).remove(uploadedPaths);
          }
          if (uploadedDocumentIds.length) {
            await admin
              .from("documents")
              .delete()
              .eq("organization_id", tenant.organizationId)
              .in("id", uploadedDocumentIds);
          }
          return NextResponse.json(
            { error: `No se pudo registrar ${upload.slotLabel}: ${createDocError?.message ?? "error"}` },
            { status: 400 },
          );
        }

        uploadedDocumentIds.push(createdDoc.id);

        if (upload.file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES) {
          await admin.from("document_processing_jobs").insert({
            organization_id: tenant.organizationId,
            document_id: createdDoc.id,
            job_type: "post_upload",
            status: "pending",
            payload: {
              source: "users.no_employee.modal",
              slot: upload.slotKey,
              checksum: upload.analysis.checksumSha256,
              mime: upload.analysis.normalizedMime,
            },
          });
        }
      }
    }

    await logAuditEvent({
      action: organizationUserProfileId ? "users.update" : "users.create",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "medium",
      metadata: {
        actor_user_id: actorId,
        has_dashboard_access: createMode === "with_account",
      },
    });

    return NextResponse.json({
      ok: true,
      mode: organizationUserProfileId ? "edit-user" : "create-user",
      message: organizationUserProfileId
        ? "Usuario actualizado correctamente (sin perfil de empleado)"
        : "Usuario creado correctamente (sin perfil de empleado)",
    });
  }

  if (isEditMode) {
    const { data: existingEmployee, error: existingEmployeeError } = await supabase
      .from("employees")
      .select("id, user_id, status")
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeId)
      .maybeSingle();

    if (existingEmployeeError || !existingEmployee) {
      return NextResponse.json({ error: "Empleado no encontrado para editar" }, { status: 404 });
    }

    const employmentStatus = employmentStatusInput || existingEmployee.status || "active";
    let linkedUserId = existingEmployee.user_id ?? null;

    if (createMode === "with_account") {
      const loginEmail = accountEmailInput || email || "";
      const admin = createSupabaseAdminClient();

      if (!linkedUserId) {
        const provisionResult = await provisionOrganizationUserAccount({
          admin,
          organizationId: tenant.organizationId,
          loginEmail,
          accountPassword,
          firstName,
          lastName,
        });

        if (!provisionResult.ok) {
          return NextResponse.json({ error: provisionResult.error }, { status: 400 });
        }

        linkedUserId = provisionResult.userId;
      }

      if (!linkedUserId) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED }, { status: 400 });
      }

      const { data: role, error: roleError } = await admin
        .from("roles")
        .select("id")
        .eq("code", "employee")
        .single();

      if (roleError || !role) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
      }

      const { data: existingMembership } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("user_id", linkedUserId)
        .maybeSingle();

      if (!existingMembership) {
        try {
          await assertPlanLimitForUsers(tenant.organizationId, 1);
        } catch (error) {
          return NextResponse.json(
            { error: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) },
            { status: 400 },
          );
        }
      }

      const { error: membershipError } = await admin.from("memberships").upsert(
        {
          organization_id: tenant.organizationId,
          user_id: linkedUserId,
          role_id: role.id,
          branch_id: branchId,
          status: "active",
        },
        { onConflict: "organization_id,user_id" },
      );

      if (membershipError) {
        return NextResponse.json({ error: `No se pudo asignar acceso al empleado: ${membershipError.message}` }, { status: 400 });
      }
    }

    const { error: updateEmployeeError } = await supabase
      .from("employees")
      .update({
        user_id: createMode === "with_account" ? linkedUserId : existingEmployee.user_id,
        branch_id: branchId,
        first_name: firstName,
        last_name: lastName,
        status: employmentStatus,
        email,
        phone,
        position,
        department,
        department_id: departmentId,
        hired_at: hiredAt,
        birth_date: birthDate,
        sex,
        nationality,
        phone_country_code: phoneCountryCode,
        address_line1: addressLine1,
        address_city: addressCity,
        address_state: addressState,
        address_postal_code: addressPostalCode,
        address_country: addressCountry,
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
        emergency_contact_email: emergencyEmail,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeId);

    if (updateEmployeeError) {
      await logAuditEvent({
        action: "employee.update",
        entityType: "employee",
        entityId: employeeId,
        organizationId: tenant.organizationId,
        eventDomain: "employees",
        outcome: "error",
        severity: "medium",
        metadata: {
          actor_user_id: actorId,
          mode: "edit",
          error: updateEmployeeError.message,
        },
      });
      return NextResponse.json({ error: `No se pudo actualizar empleado: ${updateEmployeeError.message}` }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const uploadedPaths: string[] = [];
    const uploadedDocumentIds: string[] = [];

    if (uploadFiles.length) {
      await ensureBucketExists();

      for (const upload of uploadFiles) {
        const { data: existingDuplicate } = await supabase
          .from("documents")
          .select("id, file_path, mime_type")
.is('deleted_at', null)
          .eq("organization_id", tenant.organizationId)
          .eq("checksum_sha256", upload.analysis.checksumSha256)
          .eq("file_size_bytes", upload.file.size)
          .limit(1)
          .maybeSingle();

        const path = existingDuplicate?.file_path || `${tenant.organizationId}/employees/${employeeId}/${Date.now()}-${upload.slotKey}-${upload.analysis.safeName}`;

        if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
          return NextResponse.json({ error: `Ruta invalida para ${upload.slotLabel}` }, { status: 400 });
        }

        try {
          await assertPlanLimitForStorage(tenant.organizationId, upload.file.size);
        } catch (error) {
          return NextResponse.json(
            {
              error: getPlanLimitErrorMessage(
                error,
                employeesStorageLimitForSlot(upload.slotLabel),
              ),
            },
            { status: 400 },
          );
        }

        if (!existingDuplicate) {
          const { error: uploadError } = await admin.storage
            .from(BUCKET_NAME)
            .upload(path, upload.file, {
              contentType: upload.analysis.normalizedMime,
              upsert: false,
            });

          if (uploadError) {
            return NextResponse.json({ error: `No se pudo subir ${upload.slotLabel}: ${uploadError.message}` }, { status: 400 });
          }

          uploadedPaths.push(path);
        }

        const { data: createdDoc, error: createDocError } = await supabase
          .from("documents")
          .insert({
            organization_id: tenant.organizationId,
            branch_id: branchId,
      owner_user_id: actorId,
            title: `${upload.slotLabel} - ${firstName} ${lastName}`,
            file_path: path,
            mime_type: existingDuplicate?.mime_type || upload.analysis.normalizedMime,
            original_file_name: upload.analysis.originalName,
            checksum_sha256: upload.analysis.checksumSha256,
            file_size_bytes: upload.file.size,
            access_scope: {
              locations: branchId ? [branchId] : [],
              department_ids: departmentId ? [departmentId] : [],
              users: existingEmployee.user_id ? [existingEmployee.user_id] : [],
              internal_only: true,
            },
          })
          .select("id")
          .single();

        if (createDocError || !createdDoc) {
          await admin.storage.from(BUCKET_NAME).remove([path]);
          return NextResponse.json({ error: `No se pudo registrar ${upload.slotLabel}: ${createDocError?.message ?? "error"}` }, { status: 400 });
        }

        uploadedDocumentIds.push(createdDoc.id);

        if (upload.file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES) {
          await supabase.from("document_processing_jobs").insert({
            organization_id: tenant.organizationId,
            document_id: createdDoc.id,
            job_type: "post_upload",
            status: "pending",
            payload: {
              source: "employees.edit.modal",
              slot: upload.slotKey,
              checksum: upload.analysis.checksumSha256,
              mime: upload.analysis.normalizedMime,
            },
          });
        }
      }
    }

    const allDocumentIds = Array.from(new Set([...uniqueDocIds, ...uploadedDocumentIds]));
    if (allDocumentIds.length) {
      const payload = allDocumentIds.map((documentId) => ({
        organization_id: tenant.organizationId,
        employee_id: employeeId,
        document_id: documentId,
        status: "pending",
      }));

      const { error: linkError } = await supabase
        .from("employee_documents")
        .upsert(payload, { onConflict: "employee_id,document_id" });

      if (linkError) {
        if (uploadedPaths.length) {
          await admin.storage.from(BUCKET_NAME).remove(uploadedPaths);
        }
        if (uploadedDocumentIds.length) {
          await supabase
            .from("documents")
            .delete()
            .eq("organization_id", tenant.organizationId)
            .in("id", uploadedDocumentIds);
        }
        return NextResponse.json({ error: `No se pudieron vincular documentos: ${linkError.message}` }, { status: 400 });
      }
    }

    if (contractType || contractStart || contractEnd || salaryAmountRaw || contractNotes || contractSignerName || contractSignedAt) {
      const salaryAmount = salaryAmountRaw ? Number(salaryAmountRaw) : null;
      const payload = {
        contract_type: contractType,
        contract_status: contractStatus,
        start_date: contractStart,
        end_date: contractEnd,
        salary_amount: Number.isNaN(salaryAmount ?? 0) ? null : salaryAmount,
        salary_currency: salaryCurrency,
        payment_frequency: paymentFrequency,
        notes: contractNotes,
        signer_name: contractSignerName,
        signed_at: contractSignedAt,
      };

      const { data: currentContract } = await supabase
        .from("employee_contracts")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const contractError = currentContract
        ? (
            await supabase
              .from("employee_contracts")
              .update(payload)
              .eq("organization_id", tenant.organizationId)
              .eq("id", currentContract.id)
          ).error
        : (
            await supabase.from("employee_contracts").insert({
              organization_id: tenant.organizationId,
              employee_id: employeeId,
              ...payload,
              created_by: actorId,
            })
          ).error;

      if (contractError) {
        return NextResponse.json({ error: `No se pudo actualizar contrato: ${contractError.message}` }, { status: 400 });
      }

      try {
        await upsertEmployeeContractDocument({
          organizationId: tenant.organizationId,
          companyName,
          actorId,
          employeeId,
          linkedUserId: linkedUserId ?? existingEmployee.user_id,
          firstName,
          lastName,
          branchId,
          branchName,
          departmentId,
          departmentName: department,
          positionName: position,
          hiredAt,
          contractType,
          paymentFrequency,
          salaryAmount: Number.isNaN(salaryAmount ?? 0) ? null : salaryAmount,
          salaryCurrency,
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "No se pudo generar documento de contrato" },
          { status: 400 },
        );
      }
    }

    await logAuditEvent({
      action: "employee.update",
      entityType: "employee",
      entityId: employeeId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        actor_user_id: actorId,
        mode: "edit",
      },
    });

    return NextResponse.json({ ok: true, employeeId, mode: "edit" });
  }

  if (uniqueDocIds.length) {
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id")
.is('deleted_at', null)
      .eq("organization_id", tenant.organizationId)
      .in("id", uniqueDocIds);

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 400 });
    }

    if ((docs?.length ?? 0) !== uniqueDocIds.length) {
      return NextResponse.json({ error: "Uno o mas documentos no pertenecen a la empresa" }, { status: 400 });
    }
  }

  for (const upload of uploadFiles) {
    if (upload.file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `El archivo de ${upload.slotLabel} supera 10MB` }, { status: 400 });
    }
  }

  let linkedUserId: string | null = null;
  let createdAuthUserId: string | null = null;
  let createdMembershipForLinkedUser = false;

  if (createMode === "with_account") {
    const loginEmail = accountEmailInput || email || "";
    const admin = createSupabaseAdminClient();
    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", "employee")
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
    }

    const provisionResult = await provisionOrganizationUserAccount({
      admin,
      organizationId: tenant.organizationId,
      loginEmail,
      accountPassword,
      firstName,
      lastName,
    });

    if (!provisionResult.ok) {
      return NextResponse.json({ error: provisionResult.error }, { status: 400 });
    }

    linkedUserId = provisionResult.userId;
    if (provisionResult.isNewUser) {
      createdAuthUserId = provisionResult.userId;
    }

    if (!linkedUserId) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED }, { status: 400 });
    }

    const { data: existingMembership } = await admin
      .from("memberships")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", linkedUserId)
      .maybeSingle();

    if (!existingMembership) {
      createdMembershipForLinkedUser = true;
      try {
        await assertPlanLimitForUsers(tenant.organizationId, 1);
      } catch (error) {
        return NextResponse.json(
          {
            error: getPlanLimitErrorMessage(
              error,
              EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS,
            ),
          },
          { status: 400 },
        );
      }
    }

    const { error: membershipError } = await admin.from("memberships").upsert(
      {
        organization_id: tenant.organizationId,
        user_id: linkedUserId,
        role_id: role.id,
        branch_id: branchId,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }


  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: branchId,
      user_id: linkedUserId,
      first_name: firstName,
      last_name: lastName,
      status: normalizedEmploymentStatus,
      email,
      phone,
      position,
      department,
      department_id: departmentId,
      hired_at: hiredAt,
      birth_date: birthDate,
      sex,
      nationality,
      phone_country_code: phoneCountryCode,
      address_line1: addressLine1,
      address_city: addressCity,
      address_state: addressState,
      address_postal_code: addressPostalCode,
      address_country: addressCountry,
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      emergency_contact_email: emergencyEmail,
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    await logAuditEvent({
      action: "employee.create",
      entityType: "employee",
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: actorId,
        mode: "create",
        error: employeeError?.message ?? "No se pudo crear empleado",
      },
    });
    return NextResponse.json({ error: employeeError?.message ?? "No se pudo crear empleado" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const uploadedPaths: string[] = [];
  const uploadedDocumentIds: string[] = [];

  if (uploadFiles.length) {
    await ensureBucketExists();

    for (const upload of uploadFiles) {
      const { data: existingDuplicate } = await supabase
        .from("documents")
        .select("id, file_path, mime_type")
.is('deleted_at', null)
        .eq("organization_id", tenant.organizationId)
        .eq("checksum_sha256", upload.analysis.checksumSha256)
        .eq("file_size_bytes", upload.file.size)
        .limit(1)
        .maybeSingle();

      const path = existingDuplicate?.file_path || `${tenant.organizationId}/employees/${employee.id}/${Date.now()}-${upload.slotKey}-${upload.analysis.safeName}`;

      if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
        await rollbackEmployeeCreateFlow({
          organizationId: tenant.organizationId,
          employeeId: employee.id,
          uploadedPaths,
          uploadedDocumentIds,
          linkedUserId,
          createdMembershipForLinkedUser,
          createdAuthUserId,
        });
        return NextResponse.json({ error: `Ruta invalida para ${upload.slotLabel}` }, { status: 400 });
      }

      try {
        await assertPlanLimitForStorage(tenant.organizationId, upload.file.size);
      } catch (error) {
        await rollbackEmployeeCreateFlow({
          organizationId: tenant.organizationId,
          employeeId: employee.id,
          uploadedPaths,
          uploadedDocumentIds,
          linkedUserId,
          createdMembershipForLinkedUser,
          createdAuthUserId,
        });
        return NextResponse.json(
          {
            error: getPlanLimitErrorMessage(
              error,
              employeesStorageLimitForSlot(upload.slotLabel),
            ),
          },
          { status: 400 },
        );
      }

      if (!existingDuplicate) {
        const { error: uploadError } = await admin.storage
          .from(BUCKET_NAME)
          .upload(path, upload.file, {
            contentType: upload.analysis.normalizedMime,
            upsert: false,
          });

        if (uploadError) {
          await rollbackEmployeeCreateFlow({
            organizationId: tenant.organizationId,
            employeeId: employee.id,
            uploadedPaths,
            uploadedDocumentIds,
            linkedUserId,
            createdMembershipForLinkedUser,
            createdAuthUserId,
          });
          return NextResponse.json({ error: `No se pudo subir ${upload.slotLabel}: ${uploadError.message}` }, { status: 400 });
        }

        uploadedPaths.push(path);
      }

      const { data: createdDoc, error: createDocError } = await supabase
        .from("documents")
        .insert({
          organization_id: tenant.organizationId,
          branch_id: branchId,
          owner_user_id: actorId,
          title: `${upload.slotLabel} - ${firstName} ${lastName}`,
          file_path: path,
          mime_type: existingDuplicate?.mime_type || upload.analysis.normalizedMime,
          original_file_name: upload.analysis.originalName,
          checksum_sha256: upload.analysis.checksumSha256,
          file_size_bytes: upload.file.size,
          access_scope: {
            locations: branchId ? [branchId] : [],
            department_ids: departmentId ? [departmentId] : [],
            users: linkedUserId ? [linkedUserId] : [],
            internal_only: true,
          },
        })
        .select("id")
        .single();

      if (createDocError || !createdDoc) {
        await rollbackEmployeeCreateFlow({
          organizationId: tenant.organizationId,
          employeeId: employee.id,
          uploadedPaths,
          uploadedDocumentIds,
          linkedUserId,
          createdMembershipForLinkedUser,
          createdAuthUserId,
        });
        return NextResponse.json({ error: `No se pudo registrar ${upload.slotLabel}: ${createDocError?.message ?? "error"}` }, { status: 400 });
      }

      uploadedDocumentIds.push(createdDoc.id);

      if (upload.file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES) {
        await supabase.from("document_processing_jobs").insert({
          organization_id: tenant.organizationId,
          document_id: createdDoc.id,
          job_type: "post_upload",
          status: "pending",
          payload: {
            source: "employees.new.modal",
            slot: upload.slotKey,
            checksum: upload.analysis.checksumSha256,
            mime: upload.analysis.normalizedMime,
          },
        });
      }
    }
  }

  const allDocumentIds = Array.from(new Set([...uniqueDocIds, ...uploadedDocumentIds]));
  if (allDocumentIds.length) {
    const payload = allDocumentIds.map((documentId) => ({
      organization_id: tenant.organizationId,
      employee_id: employee.id,
      document_id: documentId,
      status: "pending",
    }));
    const { error: linkError } = await supabase.from("employee_documents").insert(payload);
    if (linkError) {
      await rollbackEmployeeCreateFlow({
        organizationId: tenant.organizationId,
        employeeId: employee.id,
        uploadedPaths,
        uploadedDocumentIds,
        linkedUserId,
        createdMembershipForLinkedUser,
        createdAuthUserId,
      });
      return NextResponse.json({ error: `No se pudo completar alta de empleado: ${linkError.message}` }, { status: 400 });
    }
  }

  if (contractType || contractStart || salaryAmountRaw) {
    const salaryAmount = salaryAmountRaw ? Number(salaryAmountRaw) : null;
    const { error: contractError } = await supabase.from("employee_contracts").insert({
      organization_id: tenant.organizationId,
      employee_id: employee.id,
      contract_type: contractType,
      contract_status: contractStatus,
      start_date: contractStart,
      end_date: contractEnd,
      salary_amount: Number.isNaN(salaryAmount ?? 0) ? null : salaryAmount,
      salary_currency: salaryCurrency,
      payment_frequency: paymentFrequency,
      notes: contractNotes,
      signer_name: contractSignerName,
      signed_at: contractSignedAt,
      created_by: actorId,
    });
    if (contractError) {
      await rollbackEmployeeCreateFlow({
        organizationId: tenant.organizationId,
        employeeId: employee.id,
        uploadedPaths,
        uploadedDocumentIds,
        linkedUserId,
        createdMembershipForLinkedUser,
        createdAuthUserId,
      });
      return NextResponse.json({ error: `No se pudo completar alta de empleado: ${contractError.message}` }, { status: 400 });
    }

    try {
      await upsertEmployeeContractDocument({
        organizationId: tenant.organizationId,
        companyName,
        actorId,
        employeeId: employee.id,
        linkedUserId,
        firstName,
        lastName,
        branchId,
        branchName,
        departmentId,
        departmentName: department,
        positionName: position,
        hiredAt,
        contractType,
        paymentFrequency,
        salaryAmount: Number.isNaN(salaryAmount ?? 0) ? null : salaryAmount,
        salaryCurrency,
      });
    } catch (error) {
      await rollbackEmployeeCreateFlow({
        organizationId: tenant.organizationId,
        employeeId: employee.id,
        uploadedPaths,
        uploadedDocumentIds,
        linkedUserId,
        createdMembershipForLinkedUser,
        createdAuthUserId,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo generar documento de contrato" },
        { status: 400 },
      );
    }
  }

  await logAuditEvent({
    action: "employee.create",
    entityType: "employee",
    entityId: employee.id,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: actorId,
      mode: "create",
      with_account: createMode === "with_account",
      linked_user_id: linkedUserId,
    },
  });

  return NextResponse.json({ ok: true, employeeId: employee.id });
}

export async function PATCH(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const body = await request.json().catch(() => null) as {
    employeeId?: string;
    organizationUserProfileId?: string;
    status?: string;
  } | null;
  const employeeId = String(body?.employeeId ?? "").trim();
  const organizationUserProfileId = String(body?.organizationUserProfileId ?? "").trim();
  const status = String(body?.status ?? "").trim();

  if (!employeeId && !organizationUserProfileId) {
    return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
  }

  const isEmployeeStatus = ALLOWED_EMPLOYMENT_STATUSES.has(status);
  const isUserStatus = status === "active" || status === "inactive";
  if (!isEmployeeStatus && !isUserStatus) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  if (organizationUserProfileId) {
    if (!isUserStatus) {
      return NextResponse.json({ error: "Estado invalido para usuario" }, { status: 400 });
    }

    const { data: previousProfile } = await supabase
      .from("organization_user_profiles")
      .select("status, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .maybeSingle();

    if (!previousProfile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { error: profileError } = await supabase
      .from("organization_user_profiles")
      .update({ status })
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId);

    if (profileError) {
      return NextResponse.json({ error: `No se pudo actualizar estado del usuario: ${profileError.message}` }, { status: 400 });
    }

    const { error: membershipError } = await supabase
      .from("memberships")
      .update({ status })
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", previousProfile.user_id);

    if (membershipError) {
      await logAuditEvent({
        action: "employee.status.update",
        entityType: "organization_user_profile",
        entityId: organizationUserProfileId,
        organizationId: tenant.organizationId,
        eventDomain: "employees",
        outcome: "error",
        severity: "medium",
        metadata: {
          actor_user_id: actorId,
          status_scope: "membership_sync",
          next_status: status,
          error: membershipError.message,
        },
      });

      return NextResponse.json({ error: `No se pudo sincronizar estado de acceso: ${membershipError.message}` }, { status: 400 });
    }

    await logAuditEvent({
      action: "employee.status.update",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        actor_user_id: actorId,
        status_scope: "laboral",
        previous_status: previousProfile?.status ?? null,
        next_status: status,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (!isEmployeeStatus) {
    return NextResponse.json({ error: "Estado invalido para empleado" }, { status: 400 });
  }

  const { data: previousEmployee } = await supabase
    .from("employees")
    .select("status")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!previousEmployee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { error } = await supabase
    .from("employees")
    .update({ status })
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId);

  if (error) {
    await logAuditEvent({
      action: "employee.status.update",
      entityType: "employee",
      entityId: employeeId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "medium",
      metadata: {
        actor_user_id: actorId,
        status_scope: "laboral",
        previous_status: previousEmployee?.status ?? null,
        next_status: status,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo actualizar estado: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.status.update",
    entityType: "employee",
    entityId: employeeId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: actorId,
      status_scope: "laboral",
      previous_status: previousEmployee?.status ?? null,
      next_status: status,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const body = await request.json().catch(() => null) as {
    employeeId?: string;
    organizationUserProfileId?: string;
    membershipId?: string;
  } | null;
  const employeeId = String(body?.employeeId ?? "").trim();
  const organizationUserProfileId = String(body?.organizationUserProfileId ?? "").trim();
  const membershipId = String(body?.membershipId ?? "").trim();

  if (!employeeId && !organizationUserProfileId) {
    return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
  }

  if (organizationUserProfileId) {
    const { data: existingProfile } = await supabase
      .from("organization_user_profiles")
      .select("id, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .maybeSingle();

    if (!existingProfile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (membershipId) {
      const { data: membershipToDelete } = await supabase
        .from("memberships")
        .select("id, user_id")
        .eq("organization_id", tenant.organizationId)
        .eq("id", membershipId)
        .maybeSingle();

      if (!membershipToDelete) {
        return NextResponse.json({ error: "Acceso no encontrado" }, { status: 404 });
      }

      if (existingProfile.user_id && membershipToDelete.user_id !== existingProfile.user_id) {
        await logAuditEvent({
          action: "users.profile.delete",
          entityType: "organization_user_profile",
          entityId: organizationUserProfileId,
          organizationId: tenant.organizationId,
          eventDomain: "employees",
          outcome: "denied",
          severity: "high",
          metadata: {
            actor_user_id: actorId,
            membership_id: membershipId,
            reason: "membership_profile_mismatch",
          },
        });

        return NextResponse.json({ error: "El acceso indicado no corresponde a este usuario" }, { status: 400 });
      }

      const { error: membershipDeleteError } = await supabase
        .from("memberships")
        .delete()
        .eq("organization_id", tenant.organizationId)
        .eq("id", membershipId);

      if (membershipDeleteError) {
        return NextResponse.json({ error: `No se pudo eliminar acceso de usuario: ${membershipDeleteError.message}` }, { status: 400 });
      }
    }

    const { data: deletedProfiles, error: deleteProfileError } = await supabase
      .from("organization_user_profiles")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .select("id");

    if (deleteProfileError) {
      return NextResponse.json({ error: `No se pudo eliminar usuario: ${deleteProfileError.message}` }, { status: 400 });
    }

    if (!deletedProfiles || deletedProfiles.length === 0) {
      return NextResponse.json({ error: "No se encontró el registro o faltan permisos para eliminarlo." }, { status: 400 });
    }

    await logAuditEvent({
      action: "users.profile.delete",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "medium",
      metadata: {
        actor_user_id: actorId,
        membership_id: membershipId || null,
      },
    });

    return NextResponse.json({ ok: true });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, user_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { data: deletedEmployees, error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .select("id");

  if (deleteError) {
    await logAuditEvent({
      action: "employee.delete",
      entityType: "employee",
      entityId: employeeId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: actorId,
        error: deleteError.message,
      },
    });
    return NextResponse.json({ error: `No se pudo eliminar empleado: ${deleteError.message}` }, { status: 400 });
  }

  if (!deletedEmployees || deletedEmployees.length === 0) {
    return NextResponse.json({ error: "No se encontró el registro del empleado o faltan permisos para eliminarlo." }, { status: 400 });
  }

  // Clean up orphaned data left by the employee's dashboard account (if they had one).
  // These are scoped to this organization only — auth.users is NOT touched
  // since the user may belong to other organizations.
  const admin = createSupabaseAdminClient();

  if (employee.user_id) {
    // Remove membership in this org (prevents ghost "user" rows in the directory)
    await admin
      .from("memberships")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", employee.user_id);
  }

  // Remove the linked organization_user_profile (is_employee = true) if it exists
  await admin
    .from("organization_user_profiles")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId);

  await logAuditEvent({
    action: "employee.delete",
    entityType: "employee",
    entityId: employeeId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: actorId,
    },
  });

  return NextResponse.json({ ok: true });
}
