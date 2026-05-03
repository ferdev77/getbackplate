import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
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
import {
  clearDelegatedEmployeePermissionsByMembership,
  parseDelegatedPermissionsFromFormData,
  syncDelegatedEmployeePermissions,
} from "@/shared/lib/employee-delegation-persistence";
import {
  rollbackEmployeeCreateFlow,
  syncEmployeeProfileProjection,
  upsertEmployeeContractDocument,
} from "@/modules/employees/services/company-employees-route-support";

import {
  ALLOWED_CREATE_MODES,
  ALLOWED_CONTRACT_STATUSES,
  ALLOWED_EMPLOYMENT_STATUSES,
  ALLOWED_DOCUMENT_TYPES,
  BUCKET_NAME,
  MAX_FILE_SIZE_BYTES,
  ASYNC_POST_PROCESS_THRESHOLD_BYTES,
  EMPLOYEE_DOCUMENT_SLOT_RULES,
  resolveDocumentSlotFromTitle,
  emailSchema,
  dateOnlySchema,
  DOCUMENT_SLOT_LABELS,
  ensureBucketExists,
} from "./_shared";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
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
  const rawBranchValue = String(formData.get("branch_id") ?? "").trim();
  const branchScopeValues = formData
    .getAll("branch_ids")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const requestedBranchScopeIds = Array.from(new Set(branchScopeValues));
  const allLocations = rawBranchValue === "__all__";
  const locationScopeIds = allLocations
    ? []
    : Array.from(new Set([...(rawBranchValue ? [rawBranchValue] : []), ...requestedBranchScopeIds]));
  const branchId = allLocations ? null : (locationScopeIds[0] ?? null);
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
  const delegatedPermissions = parseDelegatedPermissionsFromFormData(formData);
  const employeeId = String(formData.get("employee_id") ?? "").trim() || null;
  const isEditMode = Boolean(employeeId);
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");

  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const documentType = String(formData.get("document_type") ?? "").trim().toLowerCase() || null;
  const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
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
          { error: `${slotLabel}: ${error instanceof Error ? error.message : "archivo inválido"}` },
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
        { error: `${slotLabel}: ${error instanceof Error ? error.message : "archivo inválido"}` },
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
    return NextResponse.json({ error: "Modo de creación inválido" }, { status: 400 });
  }

  if (email && !emailSchema.safeParse(email).success) {
    return NextResponse.json({ error: "Email de empleado inválido" }, { status: 400 });
  }

  if (accountEmailInput && !emailSchema.safeParse(accountEmailInput).success) {
    return NextResponse.json({ error: "Email de acceso inválido" }, { status: 400 });
  }

  for (const dateValue of [hiredAt, birthDate, contractStart, contractEnd, contractSignedAt]) {
    if (dateValue && !dateOnlySchema.safeParse(dateValue).success) {
      return NextResponse.json({ error: "Formato de fecha inválido (usa YYYY-MM-DD)" }, { status: 400 });
    }
  }

  if (!ALLOWED_CONTRACT_STATUSES.has(contractStatus)) {
    return NextResponse.json({ error: "Estado de contrato inválido" }, { status: 400 });
  }

  const normalizedEmploymentStatus = employmentStatusInput || "active";
  if (employmentStatusInput && !ALLOWED_EMPLOYMENT_STATUSES.has(normalizedEmploymentStatus)) {
    return NextResponse.json({ error: "Estado laboral inválido" }, { status: 400 });
  }

  if (documentType && !ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
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

  if (locationScopeIds.length) {
    const { data: branchRows, error: branchError } = await supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .in("id", locationScopeIds);

    if (branchError) {
      return NextResponse.json({ error: "Locación no válida para esta empresa" }, { status: 400 });
    }

    const validIds = new Set((branchRows ?? []).map((row) => row.id));
    const hasInvalid = locationScopeIds.some((id) => !validIds.has(id));
    if (hasInvalid) {
      return NextResponse.json({ error: "Una o más locaciones no son válidas para esta empresa" }, { status: 400 });
    }

    branchName = (branchRows ?? [])[0]?.name ?? null;
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

      const { data: membershipRow, error: membershipError } = await admin
        .from("memberships")
        .upsert(
          {
            organization_id: tenant.organizationId,
            user_id: linkedUserId,
            role_id: role.id,
            branch_id: branchId,
            all_locations: allLocations,
            location_scope_ids: locationScopeIds,
            status: "active",
          },
          { onConflict: "organization_id,user_id" },
        )
        .select("id")
        .single();

      if (membershipError || !membershipRow) {
        return NextResponse.json({ error: `No se pudo asignar acceso al usuario: ${membershipError?.message ?? "error"}` }, { status: 400 });
      }

      const delegatedSync = await syncDelegatedEmployeePermissions({
        organizationId: tenant.organizationId,
        membershipId: membershipRow.id,
        actorId,
        permissions: delegatedPermissions,
      });
      if (delegatedSync.error) {
        return NextResponse.json({ error: delegatedSync.error }, { status: 400 });
      }
    } else if (linkedUserId) {
      const { data: membershipRow } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("user_id", linkedUserId)
        .maybeSingle();
      if (membershipRow?.id) {
        const clearDelegated = await clearDelegatedEmployeePermissionsByMembership(tenant.organizationId, membershipRow.id);
        if (clearDelegated.error) {
          return NextResponse.json({ error: clearDelegated.error }, { status: 400 });
        }
      }
    }

    const profilePayload = {
      organization_id: tenant.organizationId,
      user_id: linkedUserId,
      employee_id: null,
      branch_id: branchId,
      all_locations: allLocations,
      location_scope_ids: locationScopeIds,
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
          return NextResponse.json({ error: `Ruta inválida para ${upload.slotLabel}` }, { status: 400 });
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
              locations: locationScopeIds,
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
    const employeeIdValue = employeeId as string;
    const { data: existingEmployee, error: existingEmployeeError } = await supabase
      .from("employees")
      .select("id, user_id, status")
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeIdValue)
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

      const { data: membershipRow, error: membershipError } = await admin
        .from("memberships")
        .upsert(
          {
            organization_id: tenant.organizationId,
            user_id: linkedUserId,
            role_id: role.id,
            branch_id: branchId,
            all_locations: allLocations,
            location_scope_ids: locationScopeIds,
            status: "active",
          },
          { onConflict: "organization_id,user_id" },
        )
        .select("id")
        .single();

      if (membershipError || !membershipRow) {
        return NextResponse.json({ error: `No se pudo asignar acceso al empleado: ${membershipError?.message ?? "error"}` }, { status: 400 });
      }

      const delegatedSync = await syncDelegatedEmployeePermissions({
        organizationId: tenant.organizationId,
        membershipId: membershipRow.id,
        actorId,
        permissions: delegatedPermissions,
      });
      if (delegatedSync.error) {
        return NextResponse.json({ error: delegatedSync.error }, { status: 400 });
      }
    } else if (linkedUserId) {
      const admin = createSupabaseAdminClient();
      const { data: membershipRow } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("user_id", linkedUserId)
        .maybeSingle();
      if (membershipRow?.id) {
        const clearDelegated = await clearDelegatedEmployeePermissionsByMembership(tenant.organizationId, membershipRow.id);
        if (clearDelegated.error) {
          return NextResponse.json({ error: clearDelegated.error }, { status: 400 });
        }
      }
    }

    const { error: updateEmployeeError } = await supabase
      .from("employees")
      .update({
        user_id: createMode === "with_account" ? linkedUserId : existingEmployee.user_id,
        branch_id: branchId,
        all_locations: allLocations,
        location_scope_ids: locationScopeIds,
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
        document_type: documentType,
        document_number: documentNumber,
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
          return NextResponse.json({ error: `Ruta inválida para ${upload.slotLabel}` }, { status: 400 });
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
              locations: locationScopeIds,
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
      const reviewedAt = new Date().toISOString();
      const payload = allDocumentIds.map((documentId) => ({
        organization_id: tenant.organizationId,
        employee_id: employeeIdValue,
        document_id: documentId,
        status: "approved",
        requested_without_file: false,
        pending_since_at: null,
        pending_reminder_stage: 0,
        pending_reminder_last_sent_at: null,
        reviewed_by: actorId,
        reviewed_at: reviewedAt,
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
        .eq("employee_id", employeeIdValue)
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
              employee_id: employeeIdValue,
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
          employeeId: employeeIdValue,
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

    {
      const { error: profileSyncError } = await syncEmployeeProfileProjection({
        organizationId: tenant.organizationId,
        employeeId: employeeIdValue,
        userId: linkedUserId ?? existingEmployee.user_id ?? null,
        branchId,
        allLocations,
        locationScopeIds,
        departmentId,
        positionId,
        firstName,
        lastName,
        email,
        phone,
        employeeStatus: employmentStatus,
      });

      if (profileSyncError) {
        return NextResponse.json({ error: `No se pudo sincronizar perfil de acceso: ${profileSyncError.message}` }, { status: 400 });
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
      actorId,
      metadata: {
        mode: "edit",
      },
    });

    return NextResponse.json({ ok: true, employeeId, mode: "edit" });
  }

  if (uniqueDocIds.length) {
    return NextResponse.json(
      { error: "No se permite vincular documentos del módulo Documentos al legajo del empleado" },
      { status: 400 },
    );
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

    const { data: membershipRow, error: membershipError } = await admin
      .from("memberships")
      .upsert(
        {
          organization_id: tenant.organizationId,
          user_id: linkedUserId,
          role_id: role.id,
          branch_id: branchId,
          all_locations: allLocations,
          location_scope_ids: locationScopeIds,
          status: "active",
        },
        { onConflict: "organization_id,user_id" },
      )
      .select("id")
      .single();

    if (membershipError || !membershipRow) {
      return NextResponse.json({ error: membershipError?.message ?? "No se pudo crear membership" }, { status: 400 });
    }

    const delegatedSync = await syncDelegatedEmployeePermissions({
      organizationId: tenant.organizationId,
      membershipId: membershipRow.id,
      actorId,
      permissions: delegatedPermissions,
    });
    if (delegatedSync.error) {
      return NextResponse.json({ error: delegatedSync.error }, { status: 400 });
    }
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: branchId,
      all_locations: allLocations,
      location_scope_ids: locationScopeIds,
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
      document_type: documentType,
      document_number: documentNumber,
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
      actorId,
      metadata: {
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
        return NextResponse.json({ error: `Ruta inválida para ${upload.slotLabel}` }, { status: 400 });
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
            locations: locationScopeIds,
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
    const reviewedAt = new Date().toISOString();
    const payload = allDocumentIds.map((documentId) => ({
      organization_id: tenant.organizationId,
      employee_id: employee.id,
      document_id: documentId,
      status: "approved",
      requested_without_file: false,
      pending_since_at: null,
      pending_reminder_stage: 0,
      pending_reminder_last_sent_at: null,
      reviewed_by: actorId,
      reviewed_at: reviewedAt,
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

  {
    const { error: profileSyncError } = await syncEmployeeProfileProjection({
      organizationId: tenant.organizationId,
      employeeId: employee.id,
      userId: linkedUserId,
      branchId,
      allLocations,
      locationScopeIds,
      departmentId,
      positionId,
      firstName,
      lastName,
      email,
      phone,
      employeeStatus: normalizedEmploymentStatus,
    });

    if (profileSyncError) {
      await rollbackEmployeeCreateFlow({
        organizationId: tenant.organizationId,
        employeeId: employee.id,
        uploadedPaths,
        uploadedDocumentIds,
        linkedUserId,
        createdMembershipForLinkedUser,
        createdAuthUserId,
      });
      return NextResponse.json({ error: `No se pudo sincronizar perfil de acceso: ${profileSyncError.message}` }, { status: 400 });
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
    actorId,
    metadata: {
      mode: "create",
      with_account: createMode === "with_account",
      linked_user_id: linkedUserId,
    },
  });

  return NextResponse.json({ ok: true, employeeId: employee.id });
}

