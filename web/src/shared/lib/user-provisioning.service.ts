import { SupabaseClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { EMPLOYEES_MESSAGES } from "@/shared/lib/employees-messages";
import { getTenantEmailBranding } from "@/shared/lib/email-branding";
import { sendEmail } from "@/shared/lib/brevo";
import { initialInviteTemplate } from "@/shared/lib/email-templates/invitation";
import { buildTenantAuthUrls } from "@/shared/lib/tenant-auth-branding";

export async function provisionOrganizationUserAccount(input: {
  admin: SupabaseClient;
  organizationId: string;
  loginEmail: string;
  accountPassword: string;
  firstName: string;
  lastName: string;
}): Promise<{ ok: true; userId: string; isNewUser: boolean } | { ok: false; error: string }> {
  try {
    const { admin, organizationId, loginEmail, accountPassword, firstName, lastName } = input;
    
    if (!loginEmail) {
      return { ok: false, error: EMPLOYEES_MESSAGES.ACCESS_EMAIL_REQUIRED };
    }

    if (accountPassword.length < 8) {
      return { ok: false, error: EMPLOYEES_MESSAGES.ACCESS_PASSWORD_MIN };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
    const { loginUrl } = await buildTenantAuthUrls({
      appUrl,
      organizationId,
    });
    const fullName = `${firstName} ${lastName}`.trim();
    const branding = await getTenantEmailBranding(organizationId);

    const existingAuthUser = await findAuthUserByEmail(loginEmail);
    
    if (existingAuthUser?.id) {
      const linkedUserId = existingAuthUser.id;
      
      const { error: updateError } = await admin.auth.admin.updateUserById(linkedUserId, {
        password: accountPassword,
        email_confirm: true,
        user_metadata: {
          ...(existingAuthUser.user_metadata || {}),
          full_name: fullName,
          force_password_change: true,
          temporary_password_set_at: new Date().toISOString(),
          login_password: undefined,
        },
      });

      if (updateError) {
        return { ok: false, error: `Error actualizando usuario: ${updateError.message}` };
      }

      await sendEmail({
        to: [{ email: loginEmail, name: fullName }],
        subject: "Tus credenciales de acceso a GetBackplate",
        htmlContent: initialInviteTemplate({
          fullName,
          loginEmail,
          loginPassword: accountPassword,
          loginUrl,
          branding,
        }),
      });
      
      return { ok: true, userId: linkedUserId, isNewUser: false };
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        password: accountPassword,
        user_metadata: {
          full_name: fullName,
          force_password_change: true,
          temporary_password_set_at: new Date().toISOString(),
        },
      });

      if (createError || !created.user?.id) {
        return { 
          ok: false, 
          error: `${EMPLOYEES_MESSAGES.EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX}: ${createError?.message ?? "Error desconocido"}` 
        };
      }

      const linkedUserId = created.user.id;

      await sendEmail({
        to: [{ email: loginEmail, name: fullName }],
        subject: "Bienvenido(a) a GetBackplate - Tus credenciales",
        htmlContent: initialInviteTemplate({
          fullName,
          loginEmail,
          loginPassword: accountPassword,
          loginUrl,
          branding,
        }),
      });
      
      return { ok: true, userId: linkedUserId, isNewUser: true };
    }
  } catch (error) {
    console.error("[provisionOrganizationUserAccount] Error:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Error inesperado al crear cuenta de acceso" };
  }
}
