"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantContext } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  assertPlanLimitForEmployees,
  assertPlanLimitForUsers,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";

function qs(message: string) {
  return encodeURIComponent(message);
}



export async function createEmployeeAction(prevState: any, formData: FormData) {
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
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");
  const accountRoleInput = String(formData.get("account_role") ?? "employee").trim();
  const accountRole = accountRoleInput === "company_admin" ? "company_admin" : "employee";
  const createWithAccount = createMode === "with_account";

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

  const admin = createSupabaseAdminClient();

  if (departmentId && !departmentName) {
    const { data: deptData } = await admin.from("organization_departments").select("name").eq("id", departmentId).single();
    if (deptData) departmentName = deptData.name;
  }
  if (positionId && !positionName) {
    const { data: posData } = await admin.from("department_positions").select("name").eq("id", positionId).single();
    if (posData) positionName = posData.name;
  }

  try {
    await assertPlanLimitForEmployees(tenant.organizationId, 1);
  } catch (error) {
    return { success: false, message: getPlanLimitErrorMessage(error, "Limite de empleados alcanzado. Actualiza tu plan para continuar.") };
  }

  // Admin client is used for all DB operations in this action to bypass RLS.
  // RLS is enforced at the tenant level via requireTenantContext() above.

  if (createWithAccount) {
    const loginEmail = accountEmailInput || (contactEmail ? contactEmail.toLowerCase() : "");

    if (!loginEmail) {
      return { success: false, message: "Para crear cuenta, completa el email de acceso" };
    }

    if (accountPassword.length < 8) {
      return { success: false, message: "La contrasena de acceso debe tener al menos 8 caracteres" };
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", accountRole)
      .single();

    if (roleError || !role) {
      return { success: false, message: "No existe el rol employee en la base" };
    }

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: accountPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`.trim(),
      },
    });

    if (!createUserError && createdUser.user) {
      linkedUserId = createdUser.user.id;
    }

    if (createUserError) {
      const alreadyExists =
        createUserError.message.toLowerCase().includes("already") ||
        createUserError.message.toLowerCase().includes("exists") ||
        createUserError.message.toLowerCase().includes("registered");

      if (!alreadyExists) {
        return { success: false, message: `No se pudo crear cuenta del empleado: ${createUserError.message}` };
      }

      // Privacy Fix: Do not auto-link existing users. They must be invited.
      return { success: false, message: "Este correo ya está registrado en la plataforma. El usuario debe ser invitado formalmente." };
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
        return { success: false, message: getPlanLimitErrorMessage(error, "Limite de usuarios alcanzado. Actualiza tu plan para continuar.") };
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

    employeeEmail = loginEmail;
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
    },
    eventDomain: "employees",
    outcome: "success",
    severity: createWithAccount ? "high" : "medium",
  });

  revalidatePath("/app/employees");
  revalidatePath("/app/users");
  
  const actionText = employeeId ? "actualizado" : "creado";
  const actionTextWithAccount = employeeId ? "Actualizado y cuenta creada" : "Empleado y cuenta creados";

  return {
    success: true,
    message: createWithAccount ? `${actionTextWithAccount} correctamente` : `Empleado ${actionText} correctamente`,
    timestamp: Date.now()
  };
}

export async function createUserAccountAction(prevState: any, formData: FormData) {
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

  let userId: string | null = null;

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (!createUserError && createdUser.user) {
    userId = createdUser.user.id;
  }

  if (createUserError) {
    const alreadyExists =
      createUserError.message.toLowerCase().includes("already") ||
      createUserError.message.toLowerCase().includes("exists") ||
      createUserError.message.toLowerCase().includes("registered");

    if (!alreadyExists) {
      return { success: false, message: `No se pudo crear usuario: ${createUserError.message}` };
    }

    // Privacy Fix: Do not auto-link existing users. They must be invited.
    return { success: false, message: "Este correo ya está registrado en la plataforma. El usuario debe ser invitado formalmente." };
  }

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
      return { success: false, message: getPlanLimitErrorMessage(error, "Limite de usuarios alcanzado. Actualiza tu plan para continuar.") };
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
    action: "user.create",
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
