"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { requireTenantContext } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  assertPlanLimitForEmployees,
  assertPlanLimitForStorage,
  assertPlanLimitForUsers,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";
import { EMPLOYEES_MESSAGES } from "@/shared/lib/employees-messages";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const EMPLOYEE_DOCUMENT_BUCKET_NAME = "tenant-documents";
const EMPLOYEE_DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const DOCUMENT_SLOT_LABELS: Record<string, string> = {
  photo: "Foto del Empleado",
  id: "ID / Identificacion",
  ssn: "Numero de Seguro Social",
  rec1: "Carta de Recomendacion 1",
  rec2: "Carta de Recomendacion 2",
  other: "Otro Documento",
};

async function ensureEmployeeDocumentsBucketExists() {
  const admin = createSupabaseAdminClient();

  const { data: bucket } = await admin.storage.getBucket(EMPLOYEE_DOCUMENT_BUCKET_NAME);
  if (bucket) return;

  await admin.storage.createBucket(EMPLOYEE_DOCUMENT_BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${EMPLOYEE_DOCUMENT_MAX_FILE_SIZE_BYTES}`,
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

function isAuthUserAlreadyRegisteredError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already") || normalized.includes("exists") || normalized.includes("registered");
}

async function resolveOrCreateAuthUser(params: {
  email: string;
  password: string;
  fullName: string;
  createErrorPrefix: string;
}) {
  const admin = createSupabaseAdminClient();

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      full_name: params.fullName,
    },
  });

  if (!createUserError && createdUser.user?.id) {
    return { userId: createdUser.user.id, errorMessage: null as string | null };
  }

  if (!createUserError) {
    return { userId: null as string | null, errorMessage: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED };
  }

  if (!isAuthUserAlreadyRegisteredError(createUserError.message)) {
    return {
      userId: null as string | null,
      errorMessage: `${params.createErrorPrefix}: ${createUserError.message}`,
    };
  }

  const existing = await findAuthUserByEmail(params.email);
  if (existing?.id) {
    return { userId: existing.id, errorMessage: null as string | null };
  }

  return { userId: null as string | null, errorMessage: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED };
}



export async function createEmployeeAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantContext();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    return { success: false, message: "No tienes permisos para crear empleados con tu rol actual" };
  }

  const formDataObj = Object.fromEntries(formData.entries());

  const createEmployeeSchema = z.object({
    first_name: z.string().min(1, "Nombre es obligatorio").max(100, "Nombre muy largo"),
    last_name: z.string().max(100, "Apellido muy largo").optional().or(z.literal("")),
  });

  const parsed = createEmployeeSchema.safeParse({
    first_name: formDataObj.first_name ? String(formDataObj.first_name).trim() : "",
    last_name: formDataObj.last_name ? String(formDataObj.last_name).trim() : "",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const firstName = parsed.data.first_name;
  const lastName = parsed.data.last_name && parsed.data.last_name !== "-" ? parsed.data.last_name : "";

  const contactEmail = String(formData.get("email") ?? "").trim() || null;
  const position = String(formData.get("position") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const branchIdRaw = String(formData.get("branch_id") ?? "").trim();
  const branchId = branchIdRaw || null;
  const departmentIdRaw = String(formData.get("department_id") ?? "").trim();
  const departmentId = departmentIdRaw || null;
  const positionIdRaw = String(formData.get("position_id") ?? "").trim();
  const positionId = positionIdRaw || null;
  const employeeIdRaw = String(formData.get("employee_id") ?? "").trim();
  const employeeId = employeeIdRaw || null;
  const organizationUserProfileIdRaw = String(formData.get("organization_user_profile_id") ?? "").trim();
  const organizationUserProfileId = organizationUserProfileIdRaw || null;
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");
  const existingDashboardAccess = String(formData.get("existing_dashboard_access") ?? "no").trim().toLowerCase() === "yes";
  const createWithAccount = createMode === "with_account";
  const isEmployeeRaw = String(formData.get("is_employee") ?? "yes").trim().toLowerCase();
  const isEmployeeProfile = employeeId ? true : isEmployeeRaw !== "no";

  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const birthDateRaw = String(formData.get("birth_date") ?? "").trim() || null;
  const hireDateRaw = String(formData.get("hire_date") ?? "").trim() || null;

  const documentType = String(formData.get("document_type") ?? "").trim() || null;
  const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
  const personalEmail = String(formData.get("personal_email") ?? "").trim() || null;

  let employeeEmail = contactEmail;
  let linkedUserId: string | null = null;
  let positionName: string | null = position;
  let departmentName: string | null = department;

  const uploadFiles: Array<{
    slotKey: string;
    slotLabel: string;
    file: File;
    analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  }> = [];

  for (const [slotKey, slotLabel] of Object.entries(DOCUMENT_SLOT_LABELS)) {
    const file = formData.get(`document_file_${slotKey}`);
    if (!(file instanceof File) || file.size <= 0) {
      continue;
    }

    if (file.size > EMPLOYEE_DOCUMENT_MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        message: `El archivo de ${slotLabel} supera el limite de 10MB`,
      };
    }

    try {
      const analysis = await analyzeUploadedFile(file);
      uploadFiles.push({ slotKey, slotLabel, file, analysis });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? `${slotLabel}: ${error.message}` : `${slotLabel}: archivo invalido`,
      };
    }
  }

  const admin = createSupabaseAdminClient();

  async function persistOrganizationUserProfile(params: {
    userId: string | null;
    employeeId: string | null;
    isEmployee: boolean;
    status: "active" | "inactive";
    profileId?: string | null;
  }) {
    if (params.profileId) {
      const payload = {
        branch_id: branchId || tenant.branchId || null,
        department_id: departmentId,
        position_id: positionId,
        first_name: firstName,
        last_name: lastName,
        email: employeeEmail,
        phone,
        is_employee: params.isEmployee,
        status: params.status,
        source: "users_employees_modal",
      };

      if (params.userId) {
        const { error } = await admin
          .from("organization_user_profiles")
          .update({ ...payload, user_id: params.userId, employee_id: params.employeeId })
          .eq("organization_id", tenant.organizationId)
          .eq("id", params.profileId);
        return error;
      }

      const { error } = await admin
        .from("organization_user_profiles")
        .update(payload)
        .eq("organization_id", tenant.organizationId)
        .eq("id", params.profileId);
      return error;
    }

    if (!params.userId) {
      const { error } = await admin.from("organization_user_profiles").insert({
        organization_id: tenant.organizationId,
        user_id: null,
        employee_id: params.employeeId,
        branch_id: branchId || tenant.branchId || null,
        department_id: departmentId,
        position_id: positionId,
        first_name: firstName,
        last_name: lastName,
        email: employeeEmail,
        phone,
        is_employee: params.isEmployee,
        status: params.status,
        source: "users_employees_modal",
      });

      return error;
    }

    const { error } = await admin.from("organization_user_profiles").upsert(
      {
        organization_id: tenant.organizationId,
        user_id: params.userId,
        employee_id: params.employeeId,
        branch_id: branchId || tenant.branchId || null,
        department_id: departmentId,
        position_id: positionId,
        first_name: firstName,
        last_name: lastName,
        email: employeeEmail,
        phone,
        is_employee: params.isEmployee,
        status: params.status,
        source: "users_employees_modal",
      },
      { onConflict: "organization_id,user_id" },
    );

    return error;
  }

  if (departmentId && !departmentName) {
    const { data: deptData } = await admin.from("organization_departments").select("name").eq("id", departmentId).single();
    if (deptData) departmentName = deptData.name;
  }
  if (positionId && !positionName) {
    const { data: posData } = await admin.from("department_positions").select("name").eq("id", positionId).single();
    if (posData) positionName = posData.name;
  }

  if (employeeId) {
    const { data: existingEmployee } = await admin
      .from("employees")
      .select("user_id, email")
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeId)
      .maybeSingle();

    if (existingEmployee?.user_id) {
      linkedUserId = existingEmployee.user_id;
    }
    if (!employeeEmail && existingEmployee?.email) {
      employeeEmail = existingEmployee.email;
    }
  } else if (organizationUserProfileId) {
    const { data: existingProfile } = await admin
      .from("organization_user_profiles")
      .select("user_id, email")
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .maybeSingle();

    if (existingProfile?.user_id) {
      linkedUserId = existingProfile.user_id;
    }
    if (!employeeEmail && existingProfile?.email) {
      employeeEmail = existingProfile.email;
    }
  }

  if (isEmployeeProfile && !employeeId) {
    try {
      await assertPlanLimitForEmployees(tenant.organizationId, 1);
    } catch (error) {
      return {
        success: false,
        message: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_EMPLOYEES),
      };
    }
  }

  if (!isEmployeeProfile && employeeId) {
    return { success: false, message: "La conversion de empleado a usuario simple no esta soportada desde edicion" };
  }

  // Admin client is used for all DB operations in this action to bypass RLS.
  // RLS is enforced at the tenant level via requireTenantContext() above.

  if (createWithAccount) {
    const loginEmail = accountEmailInput || (employeeEmail ? employeeEmail.toLowerCase() : "");
    const needsProvision = !linkedUserId || !existingDashboardAccess;

    if (needsProvision) {
      if (!loginEmail) {
        return { success: false, message: EMPLOYEES_MESSAGES.ACCESS_EMAIL_REQUIRED };
      }

      if (accountPassword.length < 8) {
        return { success: false, message: EMPLOYEES_MESSAGES.ACCESS_PASSWORD_MIN };
      }
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", "employee")
      .single();

    if (roleError || !role) {
      return { success: false, message: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE };
    }

    if (needsProvision) {
      const authResult = await resolveOrCreateAuthUser({
        email: loginEmail,
        password: accountPassword,
        fullName: `${firstName} ${lastName}`.trim(),
        createErrorPrefix: EMPLOYEES_MESSAGES.EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX,
      });

      if (!authResult.userId) {
        return { success: false, message: authResult.errorMessage ?? EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED };
      }

      linkedUserId = authResult.userId;
    }

    if (!linkedUserId) {
      return { success: false, message: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED };
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
        return { success: false, message: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) };
      }
    }

    const { error: membershipError } = await admin.from("memberships").upsert(
      {
        organization_id: tenant.organizationId,
        user_id: linkedUserId,
        role_id: role.id,
        branch_id: branchId || tenant.branchId || null,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      return { success: false, message: `No se pudo asignar acceso al empleado: ${membershipError.message}` };
    }

    employeeEmail = loginEmail || employeeEmail;
  }

  if (!isEmployeeProfile) {
    const profileError = await persistOrganizationUserProfile({
      userId: linkedUserId,
      employeeId: null,
      isEmployee: false,
      status: createWithAccount ? "active" : "inactive",
      profileId: organizationUserProfileId,
    });

    if (profileError) {
      return {
        success: false,
        message: `No se pudo guardar perfil de usuario: ${profileError.message}`,
      };
    }

    await logAuditEvent({
      action: "users.create",
      entityType: createWithAccount ? "membership" : "organization_user_profile",
      entityId: linkedUserId,
      organizationId: tenant.organizationId,
      branchId: branchId || tenant.branchId || null,
      metadata: {
        firstName,
        lastName,
        email: employeeEmail,
        origin: "users_employees_modal",
        isEmployeeProfile: false,
        hasDashboardAccess: createWithAccount,
      },
      eventDomain: "employees",
      outcome: "success",
      severity: "medium",
    });

    revalidatePath("/app/employees");
    revalidatePath("/app/users");
    const userAction = organizationUserProfileId ? "actualizado" : "creado";
    return {
      success: true,
      message: `Usuario ${userAction} correctamente (sin perfil de empleado)`,
      timestamp: Date.now(),
    };
  }

  // Use admin client to insert or update employee — bypasses RLS, consistent with all
  // other data operations in this module. RLS is already enforced at the
  // tenant level via requireTenantContext() at the top of this action.
  
  let employee;
  let employeeError;

  const employeePayload = {
    branch_id: branchId || tenant.branchId || null,
    first_name: firstName,
    last_name: lastName,
    email: employeeEmail,
    position: positionName,
    department: departmentName,
    department_id: departmentId,
    phone: phone,
    address_line1: address,
    birth_date: birthDateRaw,
    hired_at: hireDateRaw,
    document_type: documentType,
    document_number: documentNumber,
    personal_email: personalEmail,
  };

  if (employeeId) {
    const { data: updatedEmployee, error: updateError } = await admin
      .from("employees")
      .update({
        ...employeePayload,
        ...(linkedUserId ? { user_id: linkedUserId } : {})
      })
      .eq("id", employeeId)
      .eq("organization_id", tenant.organizationId)
      .select("id")
      .single();
    
    employee = updatedEmployee;
    employeeError = updateError;
  } else {
    const { data: insertedEmployee, error: insertError } = await admin
      .from("employees")
      .insert({
        organization_id: tenant.organizationId,
        user_id: linkedUserId,
        ...employeePayload
      })
      .select("id")
      .single();
      
    employee = insertedEmployee;
    employeeError = insertError;
  }

  if (employeeError) {
    const message =
      employeeError.message.toLowerCase().includes("row-level security") ||
      employeeError.message.toLowerCase().includes("permission")
        ? "No tienes permisos para crear/editar empleados con tu rol actual"
        : `No se pudo guardar el empleado: ${employeeError.message}`;

    return { success: false, message };
  }

  if (linkedUserId && employee?.id) {
    const profileError = await persistOrganizationUserProfile({
      userId: linkedUserId,
      employeeId: employee.id,
      isEmployee: true,
      status: "active",
      profileId: organizationUserProfileId,
    });

    if (profileError) {
      return {
        success: false,
        message: `No se pudo guardar perfil del usuario del empleado: ${profileError.message}`,
      };
    }
  }

  let documentUploadWarning: string | null = null;
  if (uploadFiles.length && employee?.id) {
    await ensureEmployeeDocumentsBucketExists();

    const uploadedPaths: string[] = [];
    const uploadedDocumentIds: string[] = [];

    try {
      for (const upload of uploadFiles) {
        const { data: existingDuplicate } = await admin
          .from("documents")
          .select("id, file_path, mime_type")
          .eq("organization_id", tenant.organizationId)
          .eq("checksum_sha256", upload.analysis.checksumSha256)
          .eq("file_size_bytes", upload.file.size)
          .limit(1)
          .maybeSingle();

        const path =
          existingDuplicate?.file_path ||
          `${tenant.organizationId}/employees/${employee.id}/${Date.now()}-${upload.slotKey}-${upload.analysis.safeName}`;

        if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
          throw new Error(`Ruta invalida para ${upload.slotLabel}`);
        }

        if (!existingDuplicate) {
          await assertPlanLimitForStorage(tenant.organizationId, upload.file.size);

          const { error: uploadError } = await admin.storage
            .from(EMPLOYEE_DOCUMENT_BUCKET_NAME)
            .upload(path, upload.file, {
              contentType: upload.analysis.normalizedMime,
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`No se pudo subir ${upload.slotLabel}: ${uploadError.message}`);
          }

          uploadedPaths.push(path);
        }

        const { data: createdDoc, error: createDocError } = await admin
          .from("documents")
          .insert({
            organization_id: tenant.organizationId,
            branch_id: branchId || tenant.branchId || null,
            owner_user_id: linkedUserId,
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
          throw new Error(`No se pudo registrar ${upload.slotLabel}: ${createDocError?.message ?? "error"}`);
        }

        uploadedDocumentIds.push(createdDoc.id);
      }

      if (uploadedDocumentIds.length) {
        const payload = uploadedDocumentIds.map((documentId) => ({
          organization_id: tenant.organizationId,
          employee_id: employee.id,
          document_id: documentId,
          status: "pending",
        }));

        const { error: linkError } = await admin
          .from("employee_documents")
          .upsert(payload, { onConflict: "employee_id,document_id" });

        if (linkError) {
          throw new Error(`No se pudieron vincular documentos al empleado: ${linkError.message}`);
        }
      }
    } catch (error) {
      if (uploadedPaths.length) {
        await admin.storage.from(EMPLOYEE_DOCUMENT_BUCKET_NAME).remove(uploadedPaths);
      }

      if (uploadedDocumentIds.length) {
        await admin
          .from("documents")
          .delete()
          .eq("organization_id", tenant.organizationId)
          .in("id", uploadedDocumentIds);
      }

      documentUploadWarning = getPlanLimitErrorMessage(
        error,
        EMPLOYEES_MESSAGES.ATTACHMENTS_SAVE_WARNING,
      );
    }
  }

  // Save salary / contract info if provided
  const salaryAmountRaw = String(formData.get("salary_amount") ?? "").trim();
  const salaryAmount = salaryAmountRaw !== "" ? parseFloat(salaryAmountRaw) : null;
  const paymentFrequency = String(formData.get("payment_frequency") ?? "").trim() || null;
  const contractType = String(formData.get("contract_type") ?? "").trim() || null;
  const contractSignerName = String(formData.get("contract_signer_name") ?? "").trim() || null;
  const contractSignedAt = String(formData.get("contract_signed_at") ?? "").trim() || null;

  if (salaryAmount !== null || paymentFrequency || contractType) {
    await admin.from("employee_contracts").upsert(
      {
        employee_id: employee?.id,
        organization_id: tenant.organizationId,
        branch_id: branchId || tenant.branchId || null,
        salary_amount: salaryAmount,
        salary_currency: "ARS",
        payment_frequency: paymentFrequency,
        contract_type: contractType || "indefinite",
        signer_name: contractSignerName,
        signed_at: contractSignedAt || null,
        contract_status: "active",
      },
      { onConflict: "employee_id,organization_id", ignoreDuplicates: false }
    );
  }

  await logAuditEvent({
    action: "employee.create",
    entityType: "employee",
    entityId: employee?.id,
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    metadata: {
      firstName,
      lastName,
      email: employeeEmail,
      position,
      department,
      createWithAccount,
      linkedUserId,
      uploadedDocumentsCount: uploadFiles.length,
      documentsWarning: documentUploadWarning,
    },
    eventDomain: "employees",
    outcome: "success",
    severity: createWithAccount ? "high" : "medium",
  });

  revalidatePath("/app/employees");
  revalidatePath("/app/users");
  
  const actionText = employeeId ? "actualizado" : "creado";
  const actionTextWithAccount = employeeId ? "Actualizado y cuenta creada" : "Empleado y cuenta creados";
  const baseMessage = createWithAccount ? `${actionTextWithAccount} correctamente` : `Empleado ${actionText} correctamente`;

  return {
    success: true,
    message: documentUploadWarning
      ? `${baseMessage}. Aviso: ${documentUploadWarning}`
      : baseMessage,
    timestamp: Date.now()
  };
}

export async function createUserAccountAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantContext();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    return { success: false, message: "No tienes permisos para crear usuarios con tu rol actual" };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleCodeInput = String(formData.get("role_code") ?? "employee").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const accessStatus = String(formData.get("access_status") ?? "active").trim();

  if (!fullName || !email) {
    return { success: false, message: "Nombre completo y correo corporativo son obligatorios" };
  }

  if (password.length < 8) {
    return { success: false, message: "La contrasena debe tener al menos 8 caracteres" };
  }

  const roleCode =
    roleCodeInput === "company_admin" || roleCodeInput === "manager"
      ? roleCodeInput
      : "employee";

  const admin = createSupabaseAdminClient();
  // Removed department and position checks as Users are no longer linked to Employees
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .single();

  if (roleError || !role) {
    return { success: false, message: "No se encontro el rol seleccionado" };
  }

  const authResult = await resolveOrCreateAuthUser({
    email,
    password,
    fullName,
    createErrorPrefix: EMPLOYEES_MESSAGES.USER_CREATE_FAILED_PREFIX,
  });

  if (!authResult.userId) {
    return { success: false, message: authResult.errorMessage ?? EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED };
  }

  const userId = authResult.userId;

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingMembership) {
    try {
      await assertPlanLimitForUsers(tenant.organizationId, 1);
    } catch (error) {
      return { success: false, message: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) };
    }
  }

  const { error: membershipError } = await admin.from("memberships").upsert(
    {
      organization_id: tenant.organizationId,
      user_id: userId,
      role_id: role.id,
      branch_id: branchId,
      status: accessStatus === "inactivo" ? "inactive" : "active",
    },
    { onConflict: "organization_id,user_id" },
  );

  if (membershipError) {
    return { success: false, message: `No se pudo asignar membresia: ${membershipError.message}` };
  }

  // We no longer create an Employee record for a pure User.

  await logAuditEvent({
    action: "users.create",
    entityType: "membership",
    entityId: userId,
    organizationId: tenant.organizationId,
    branchId,
    metadata: { fullName, email, roleCode, accessStatus, branchId },
    eventDomain: "employees",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/employees");
  revalidatePath("/app/users");
  return { success: true, message: "Usuario creado correctamente", timestamp: Date.now() };
}
