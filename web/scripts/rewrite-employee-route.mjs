import fs from "fs";

const newCode = `async function rollbackStorageAndAuth(input: {
  uploadedPaths: string[];
  createdAuthUserId: string | null;
}) {
  const admin = createSupabaseAdminClient();
  try {
    if (input.uploadedPaths.length) {
      await admin.storage.from(BUCKET_NAME).remove(input.uploadedPaths);
    }
    if (input.createdAuthUserId) {
      await admin.auth.admin.deleteUser(input.createdAuthUserId);
    }
  } catch {
    // best effort rollback
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
    const file = formData.get(\`document_file_\${slotKey}\`);
    if (file instanceof File && file.size > 0) {
      try {
        const analysis = await analyzeUploadedFile(file);
        uploadFiles.push({ slotKey, slotLabel, file, analysis });
      } catch (error) {
        return NextResponse.json(
          { error: \`\${slotLabel}: \${error instanceof Error ? error.message : "archivo invalido"}\` },
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
        if (!loginEmail) {
          return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_EMAIL_REQUIRED }, { status: 400 });
        }

        if (accountPassword.length < 8) {
          return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_PASSWORD_MIN }, { status: 400 });
        }

        const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
          email: loginEmail,
          password: accountPassword,
          email_confirm: true,
          user_metadata: { full_name: \`\${firstName} \${lastName}\`.trim() },
        });

        if (!createUserError && createdUser.user) {
          linkedUserId = createdUser.user.id;
        }

        if (createUserError) {
          const exists =
            createUserError.message.toLowerCase().includes("already") ||
            createUserError.message.toLowerCase().includes("exists") ||
            createUserError.message.toLowerCase().includes("registered");
          if (!exists) {
            return NextResponse.json(
              { error: \`\${EMPLOYEES_MESSAGES.EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX}: \${createUserError.message}\` },
              { status: 400 },
            );
          }
          const existing = await findAuthUserByEmail(loginEmail);
          linkedUserId = existing?.id ?? null;
        }
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
        return NextResponse.json({ error: \`No se pudo asignar acceso al usuario: \${membershipError.message}\` }, { status: 400 });
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
      : await admin.from("organization_user_profiles").insert(profilePayload);

    if (profileResult.error) {
      return NextResponse.json({ error: \`No se pudo guardar perfil de usuario: \${profileResult.error.message}\` }, { status: 400 });
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

  // --- EDIT MODE ---
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
      return NextResponse.json({ error: \`No se pudo actualizar empleado: \${updateEmployeeError.message}\` }, { status: 400 });
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

        const path = existingDuplicate?.file_path || \`\${tenant.organizationId}/employees/\${employeeId}/\${Date.now()}-\${upload.slotKey}-\${upload.analysis.safeName}\`;

        if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
          return NextResponse.json({ error: \`Ruta invalida para \${upload.slotLabel}\` }, { status: 400 });
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
            return NextResponse.json({ error: \`No se pudo subir \${upload.slotLabel}: \${uploadError.message}\` }, { status: 400 });
          }

          uploadedPaths.push(path);
        }

        const { data: createdDoc, error: createDocError } = await supabase
          .from("documents")
          .insert({
            organization_id: tenant.organizationId,
            branch_id: branchId,
            owner_user_id: actorId,
            title: \`\${upload.slotLabel} - \${firstName} \${lastName}\`,
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
          return NextResponse.json({ error: \`No se pudo registrar \${upload.slotLabel}: \${createDocError?.message ?? "error"}\` }, { status: 400 });
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
        return NextResponse.json({ error: \`No se pudieron vincular documentos: \${linkError.message}\` }, { status: 400 });
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
        return NextResponse.json({ error: \`No se pudo actualizar contrato: \${contractError.message}\` }, { status: 400 });
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

  // --- NEW CREATION FLOW ---
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
      return NextResponse.json({ error: "Uno o mas documentos preexistentes son invalidos" }, { status: 400 });
    }
  }

  for (const upload of uploadFiles) {
    if (upload.file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: \`El archivo de \${upload.slotLabel} supera 10MB\` }, { status: 400 });
    }
  }

  let linkedUserId: string | null = null;
  let createdAuthUserId: string | null = null;
  const admin = createSupabaseAdminClient();
  let employeeRole: { id: string } | null = null;

  if (createMode === "with_account") {
    const loginEmail = accountEmailInput || email || "";
    if (!loginEmail) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_EMAIL_REQUIRED }, { status: 400 });
    }
    if (accountPassword.length < 8) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ACCESS_PASSWORD_MIN }, { status: 400 });
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", "employee")
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
    }
    employeeRole = role;

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: accountPassword,
      email_confirm: true,
      user_metadata: { full_name: \`\${firstName} \${lastName}\`.trim() },
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
          { error: \`\${EMPLOYEES_MESSAGES.EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX}: \${createUserError.message}\` },
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
      try {
        await assertPlanLimitForUsers(tenant.organizationId, 1);
      } catch (error) {
        if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
        return NextResponse.json(
          { error: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) },
          { status: 400 },
        );
      }
    }
  }

  // Pre-upload files to Storage (using a random UUID to avoid needing the employee ID early)
  const uploadedPaths: string[] = [];
  const documentsPayload: any[] = [];
  const storageFolderId = crypto.randomUUID();

  // First, add existing document IDs
  for (const docId of uniqueDocIds) {
    documentsPayload.push({ id: docId });
  }

  if (uploadFiles.length) {
    await ensureBucketExists();

    for (const upload of uploadFiles) {
      let path = \`\${tenant.organizationId}/employees/\${storageFolderId}/\${Date.now()}-\${upload.slotKey}-\${upload.analysis.safeName}\`;

      // basic dedup check
      const { data: existingDuplicate } = await supabase
        .from("documents")
        .select("id, file_path, mime_type")
        .eq("organization_id", tenant.organizationId)
        .eq("checksum_sha256", upload.analysis.checksumSha256)
        .eq("file_size_bytes", upload.file.size)
        .limit(1)
        .maybeSingle();

      if (existingDuplicate?.file_path) {
        path = existingDuplicate.file_path;
      }

      if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
        await rollbackStorageAndAuth({ uploadedPaths, createdAuthUserId });
        return NextResponse.json({ error: \`Ruta invalida para \${upload.slotLabel}\` }, { status: 400 });
      }

      try {
        await assertPlanLimitForStorage(tenant.organizationId, upload.file.size);
      } catch (error) {
        await rollbackStorageAndAuth({ uploadedPaths, createdAuthUserId });
        return NextResponse.json(
          { error: getPlanLimitErrorMessage(error, employeesStorageLimitForSlot(upload.slotLabel)) },
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
          await rollbackStorageAndAuth({ uploadedPaths, createdAuthUserId });
          return NextResponse.json({ error: \`No se pudo subir \${upload.slotLabel}: \${uploadError.message}\` }, { status: 400 });
        }
        uploadedPaths.push(path);
      }

      const docObj: any = {
        branch_id: branchId,
        owner_user_id: actorId,
        title: \`\${upload.slotLabel} - \${firstName} \${lastName}\`,
        file_path: path,
        mime_type: existingDuplicate?.mime_type || upload.analysis.normalizedMime,
        original_file_name: upload.analysis.originalName,
        checksum_sha256: upload.analysis.checksumSha256,
        file_size_bytes: upload.file.size,
        access_scope: {
          locations: branchId ? [branchId] : [],
          department_ids: departmentId ? [departmentId] : [],
          users: linkedUserId ? [linkedUserId] : [],
        }
      };

      if (upload.file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES) {
         docObj.processing_payload = {
            source: "employees.new.modal",
            slot: upload.slotKey,
            checksum: upload.analysis.checksumSha256,
            mime: upload.analysis.normalizedMime,
         };
      }

      documentsPayload.push(docObj);
    }
  }

  const salaryAmount = salaryAmountRaw ? Number(salaryAmountRaw) : null;

  const { data: rpcResult, error: rpcError } = await supabase.rpc("create_employee_transaction", {
    p_organization_id: tenant.organizationId,
    p_linked_user_id: linkedUserId,
    p_branch_id: branchId,
    p_department_id: departmentId,
    p_position_id: positionId,
    p_position: position,
    p_department: department,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_phone: phone,
    p_status: normalizedEmploymentStatus,
    p_hired_at: hiredAt,
    p_birth_date: birthDate,
    p_sex: sex,
    p_nationality: nationality,
    p_phone_country_code: phoneCountryCode,
    p_address_line1: addressLine1,
    p_address_city: addressCity,
    p_address_state: addressState,
    p_address_postal_code: addressPostalCode,
    p_address_country: addressCountry,
    p_emergency_contact_name: emergencyName,
    p_emergency_contact_phone: emergencyPhone,
    p_emergency_contact_email: emergencyEmail,
    p_create_membership: createMode === "with_account",
    p_role_id: employeeRole?.id ?? null,
    p_profile_source: "users_employees_modal",
    p_contract_type: contractType,
    p_contract_status: contractStatus,
    p_contract_start_date: contractStart,
    p_contract_end_date: contractEnd,
    p_salary_amount: Number.isNaN(salaryAmount ?? 0) ? null : salaryAmount,
    p_salary_currency: salaryCurrency,
    p_payment_frequency: paymentFrequency,
    p_contract_notes: contractNotes,
    p_contract_signer_name: contractSignerName,
    p_contract_signed_at: contractSignedAt,
    p_documents: documentsPayload
  });

  if (rpcError || !rpcResult) {
    await rollbackStorageAndAuth({ uploadedPaths, createdAuthUserId });
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
        error: rpcError?.message ?? "Transaccion RPC fallo al crear empleado",
      },
    });
    return NextResponse.json({ error: \`Error al guardar empleado: \${rpcError?.message ?? 'Desconocido'}\` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.create",
    entityType: "employee",
    entityId: rpcResult.employee_id,
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

  return NextResponse.json({ ok: true, employeeId: rpcResult.employee_id });
}
\`;

const content = fs.readFileSync("c:/Users/pikachu/Downloads/saasresto/web/src/app/api/company/employees/route.ts", "utf8");
const lines = content.split('\\n');

// 0 to 46 (incl) = lines 1-47
const part1 = lines.slice(0, 47).join('\\n');
// line index 1086 is "export async function PATCH"
const part3 = lines.slice(1086).join('\\n');

const fullNewContent = part1 + '\\n\\n' + newCode + '\\n\\n' + part3;

fs.writeFileSync("c:/Users/pikachu/Downloads/saasresto/web/src/app/api/company/employees/route.ts", fullNewContent);
console.log("Successfully replaced route.ts!");
