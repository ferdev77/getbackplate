"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

async function findAuthUserByEmail(email: string) {
  const supabase = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      return null;
    }

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function createEmployeeAction(formData: FormData) {
  const tenant = await requireTenantContext();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    redirect(
      "/app/employees?status=error&message=" +
        qs("No tienes permisos para crear empleados con tu rol actual"),
    );
  }

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const contactEmail = String(formData.get("email") ?? "").trim() || null;
  const position = String(formData.get("position") ?? "").trim() || null;
  const department = String(formData.get("department") ?? "").trim() || null;
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const accountEmailInput = String(formData.get("account_email") ?? "")
    .trim()
    .toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");
  const createWithAccount = createMode === "with_account";

  if (!firstName || !lastName) {
    redirect("/app/employees?status=error&message=" + qs("Nombre y apellido son obligatorios"));
  }

  try {
    await assertPlanLimitForEmployees(tenant.organizationId, 1);
  } catch (error) {
    redirect(
      "/app/employees?status=error&message=" +
        qs(getPlanLimitErrorMessage(error, "Limite de empleados alcanzado. Actualiza tu plan para continuar.")),
    );
  }

  let linkedUserId: string | null = null;
  let employeeEmail = contactEmail;

  if (createWithAccount) {
    const loginEmail = accountEmailInput || (contactEmail ? contactEmail.toLowerCase() : "");

    if (!loginEmail) {
      redirect(
        "/app/employees?status=error&message=" +
          qs("Para crear cuenta, completa el email de acceso"),
      );
    }

    if (accountPassword.length < 8) {
      redirect(
        "/app/employees?status=error&message=" +
          qs("La contrasena de acceso debe tener al menos 8 caracteres"),
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("code", "employee")
      .single();

    if (roleError || !role) {
      redirect(
        "/app/employees?status=error&message=" +
          qs("No existe el rol employee en la base"),
      );
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
        redirect(
          "/app/employees?status=error&message=" +
            qs(`No se pudo crear cuenta del empleado: ${createUserError.message}`),
        );
      }

      const existingUser = await findAuthUserByEmail(loginEmail);
      linkedUserId = existingUser?.id ?? null;

    if (!linkedUserId) {
        redirect(
          "/app/employees?status=error&message=" +
            qs("El email ya existe pero no se pudo recuperar el usuario"),
        );
      }
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
        redirect(
          "/app/employees?status=error&message=" +
            qs(getPlanLimitErrorMessage(error, "Limite de usuarios alcanzado. Actualiza tu plan para continuar.")),
        );
      }
    }

    const { error: membershipError } = await admin.from("memberships").upsert(
      {
        organization_id: tenant.organizationId,
        user_id: linkedUserId,
        role_id: role.id,
        branch_id: tenant.branchId,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      redirect(
        "/app/employees?status=error&message=" +
          qs(`No se pudo asignar acceso al empleado: ${membershipError.message}`),
      );
    }

    employeeEmail = loginEmail;
  }

  const supabase = await createSupabaseServerClient();
  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: tenant.branchId,
      user_id: linkedUserId,
      first_name: firstName,
      last_name: lastName,
      email: employeeEmail,
      position,
      department,
    })
    .select("id")
    .single();

  if (error) {
    const message =
      error.message.toLowerCase().includes("row-level security") ||
      error.message.toLowerCase().includes("permission")
        ? "No tienes permisos para crear empleados con tu rol actual"
        : `No se pudo crear el empleado: ${error.message}`;

    redirect("/app/employees?status=error&message=" + qs(message));
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
  redirect(
    "/app/employees?status=success&message=" +
      qs(
        createWithAccount
          ? "Empleado y cuenta creados correctamente"
          : "Empleado creado correctamente",
      ),
  );
}

export async function createUserAccountAction(formData: FormData) {
  const tenant = await requireTenantContext();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    redirect(
      "/app/employees?status=error&message=" +
        qs("No tienes permisos para crear usuarios con tu rol actual"),
    );
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleCodeInput = String(formData.get("role_code") ?? "employee").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  let departmentId = String(formData.get("department_id") ?? "").trim() || null;
  const positionId = String(formData.get("position_id") ?? "").trim() || null;
  const accessStatus = String(formData.get("access_status") ?? "active").trim();

  if (!fullName || !email) {
    redirect(
      "/app/employees?status=error&message=" +
        qs("Nombre completo y correo corporativo son obligatorios"),
    );
  }

  if (password.length < 8) {
    redirect(
      "/app/employees?status=error&message=" +
        qs("La contrasena debe tener al menos 8 caracteres"),
    );
  }

  const roleCode =
    roleCodeInput === "company_admin" || roleCodeInput === "manager"
      ? roleCodeInput
      : "employee";

  const admin = createSupabaseAdminClient();
  let departmentName: string | null = null;
  let positionName: string | null = null;

  if (branchId) {
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();
    if (!branch) {
      redirect("/app/employees?status=error&message=" + qs("Locacion invalida para esta empresa"));
    }
  }

  if (departmentId) {
    const { data: department } = await admin
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (!department) {
      redirect("/app/employees?status=error&message=" + qs("Departamento invalido para esta empresa"));
    }

    departmentName = department.name;
  }

  if (positionId) {
    const { data: position } = await admin
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", positionId)
      .eq("is_active", true)
      .maybeSingle();

    if (!position) {
      redirect("/app/employees?status=error&message=" + qs("Puesto invalido para esta empresa"));
    }

    if (departmentId && departmentId !== position.department_id) {
      redirect("/app/employees?status=error&message=" + qs("El puesto no pertenece al departamento seleccionado"));
    }

    departmentId = position.department_id;
    positionName = position.name;

    const { data: department } = await admin
      .from("organization_departments")
      .select("name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (!department) {
      redirect("/app/employees?status=error&message=" + qs("Departamento invalido para el puesto seleccionado"));
    }

    departmentName = department.name;
  }
  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .single();

  if (roleError || !role) {
    redirect(
      "/app/employees?status=error&message=" + qs("No se encontro el rol seleccionado"),
    );
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
      redirect(
        "/app/employees?status=error&message=" +
          qs(`No se pudo crear usuario: ${createUserError.message}`),
      );
    }

    const existingUser = await findAuthUserByEmail(email);
    userId = existingUser?.id ?? null;
  }

  if (!userId) {
    redirect(
      "/app/employees?status=error&message=" +
        qs("No se pudo recuperar usuario para asignar acceso"),
    );
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
      redirect(
        "/app/employees?status=error&message=" +
          qs(getPlanLimitErrorMessage(error, "Limite de usuarios alcanzado. Actualiza tu plan para continuar.")),
      );
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
    redirect(
      "/app/employees?status=error&message=" +
        qs(`No se pudo asignar membresia: ${membershipError.message}`),
    );
  }

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts.shift() ?? fullName;
  const lastName = nameParts.join(" ") || "-";
  const { data: existingEmployee } = await admin
    .from("employees")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingEmployee?.id) {
    try {
      await assertPlanLimitForEmployees(tenant.organizationId, 1);
    } catch (error) {
      redirect(
        "/app/employees?status=error&message=" +
          qs(getPlanLimitErrorMessage(error, "Limite de empleados alcanzado. Actualiza tu plan para continuar.")),
      );
    }
  }

  if (existingEmployee?.id) {
    await admin
      .from("employees")
      .update({
        branch_id: branchId,
        email,
        department_id: departmentId,
        department: departmentName,
        position: positionName,
        status: accessStatus === "inactivo" ? "inactive" : "active",
      })
      .eq("organization_id", tenant.organizationId)
      .eq("id", existingEmployee.id);
  } else {
    await admin.from("employees").insert({
      organization_id: tenant.organizationId,
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      branch_id: branchId,
      department_id: departmentId,
      department: departmentName,
      position: positionName,
      status: accessStatus === "inactivo" ? "inactive" : "active",
    });
  }

  await logAuditEvent({
    action: "user.create",
    entityType: "membership",
    entityId: userId,
    organizationId: tenant.organizationId,
    branchId,
    metadata: { fullName, email, roleCode, accessStatus, branchId, departmentId, positionId },
    eventDomain: "employees",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/employees");
  redirect("/app/employees?status=success&message=" + qs("Usuario creado correctamente"));
}
