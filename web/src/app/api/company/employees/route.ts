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
  rec1: "Carta de Recomendacion 1",
  rec2: "Carta de Recomendacion 2",
  other: "Otro Documento",
};

async function ensureBucketExists() {
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (bucket) return;
  await admin.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
}

async function findAuthUserByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;

    if (data.users.length < perPage) return null;
    page += 1;
  }
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
  } catch {
    // rollback best-effort
  }
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const employmentStatus = String(formData.get("employment_status") ?? "active").trim() || "active";
  const hiredAt = String(formData.get("hired_at") ?? "").trim() || null;
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim() || null;
  const isEditMode = Boolean(employeeId);
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");

  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const nationality = String(formData.get("nationality") ?? "").trim() || null;
  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim() || null;
  const addressLine1 = String(formData.get("address_line1") ?? "").trim() || null;
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

  const selectedDocIds = formData
    .getAll("employee_document_id")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const uniqueDocIds = [...new Set(selectedDocIds)];

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

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Nombre y apellido son obligatorios" }, { status: 400 });
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

  if (!ALLOWED_EMPLOYMENT_STATUSES.has(employmentStatus)) {
    return NextResponse.json({ error: "Estado laboral invalido" }, { status: 400 });
  }

  if (!isEditMode) {
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
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      return NextResponse.json({ error: "Locacion no valida para esta empresa" }, { status: 400 });
    }
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

    const { data: departmentRow, error: departmentError } = await supabase
      .from("organization_departments")
      .select("name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (departmentError || !departmentRow) {
      return NextResponse.json({ error: "Departamento no valido para el puesto seleccionado" }, { status: 400 });
    }

    department = departmentRow.name;
  }

  if (isEditMode) {
    const { data: existingEmployee, error: existingEmployeeError } = await supabase
      .from("employees")
      .select("id, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeId)
      .maybeSingle();

    if (existingEmployeeError || !existingEmployee) {
      return NextResponse.json({ error: "Empleado no encontrado para editar" }, { status: 404 });
    }

    const { error: updateEmployeeError } = await supabase
      .from("employees")
      .update({
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

    const allDocumentIds = [...new Set([...uniqueDocIds, ...uploadedDocumentIds])];

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
    if (!loginEmail) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_EMAIL_REQUIRED }, { status: 400 });
    }
    if (accountPassword.length < 8) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_PASSWORD_MIN }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", "employee")
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
    }

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: accountPassword,
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}`.trim() },
    });

    if (!createUserError && createdUser.user) {
      linkedUserId = createdUser.user.id;
      createdAuthUserId = createdUser.user.id;
    }

    if (createUserError) {
      const exists =
        createUserError.message.toLowerCase().includes("already") ||
        createUserError.message.toLowerCase().includes("exists") ||
        createUserError.message.toLowerCase().includes("registered");
      if (!exists) {
        return NextResponse.json(
          { error: `${EMPLOYEES_MESSAGES.EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX}: ${createUserError.message}` },
          { status: 400 },
        );
      }
      const existing = await findAuthUserByEmail(loginEmail);
      linkedUserId = existing?.id ?? null;
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

  const allDocumentIds = [...new Set([...uniqueDocIds, ...uploadedDocumentIds])];

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
    membershipId?: string;
    roleCode?: string;
    branchId?: string | null;
    status?: string;
  } | null;
  const employeeId = String(body?.employeeId ?? "").trim();
  const organizationUserProfileId = String(body?.organizationUserProfileId ?? "").trim();
  const membershipId = String(body?.membershipId ?? "").trim();
  const roleCode = String(body?.roleCode ?? "employee").trim() || "employee";
  const branchId = body?.branchId ? String(body.branchId).trim() : null;
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
    const { error: profileError } = await supabase
      .from("organization_user_profiles")
      .update({ status })
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId);

    if (profileError) {
      return NextResponse.json({ error: `No se pudo actualizar estado del usuario: ${profileError.message}` }, { status: 400 });
    }

    if (membershipId) {
      const { data: role } = await supabase
        .from("roles")
        .select("id")
        .eq("code", roleCode)
        .maybeSingle();

      if (role?.id) {
        await supabase
          .from("memberships")
          .update({ status, role_id: role.id, branch_id: branchId })
          .eq("organization_id", tenant.organizationId)
          .eq("id", membershipId);
      }
    }

    await logAuditEvent({
      action: "users.profile.status.update",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        actor_user_id: actorId,
        status,
        membership_id: membershipId || null,
      },
    });

    return NextResponse.json({ ok: true });
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
        status,
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
      status,
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
    if (membershipId) {
      await supabase
        .from("memberships")
        .delete()
        .eq("organization_id", tenant.organizationId)
        .eq("id", membershipId);
    }

    const { error: deleteProfileError } = await supabase
      .from("organization_user_profiles")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId);

    if (deleteProfileError) {
      return NextResponse.json({ error: `No se pudo eliminar usuario: ${deleteProfileError.message}` }, { status: 400 });
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
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId);

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
