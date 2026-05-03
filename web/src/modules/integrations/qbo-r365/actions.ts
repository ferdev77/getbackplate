"use server";

import { revalidatePath } from "next/cache";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365Snapshot, upsertQboR365Config } from "@/modules/integrations/qbo-r365/service";
import { qboR365ConfigUpsertSchema } from "@/modules/integrations/qbo-r365/types";

export async function saveIntegrationConfigAction(formData: FormData) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return { status: "error", message: access.error };
  }

  try {
    const ftpHost = String(formData.get("ftpHost") ?? "").trim();
    const ftpUsername = String(formData.get("ftpUsername") ?? "").trim();
    const ftpPassword = String(formData.get("ftpPassword") ?? "").trim();
    const ftpRemotePath = String(formData.get("ftpRemotePath") ?? "").trim();
    const ftpPortRaw = formData.get("ftpPort");
    const settingsTemplate = String(formData.get("settingsTemplate") ?? "").trim();

    const rawData: Record<string, unknown> = {};

    const ftpPort = ftpPortRaw ? Number(ftpPortRaw) : 21;
    const hasFtpCredentialsInput = Boolean(ftpHost || ftpUsername || ftpPassword);
    const hasFtpAdvancedInput = Boolean((ftpRemotePath && ftpRemotePath !== "/APImports/R365") || ftpPort !== 21);
    const hasAnyFtpField = hasFtpCredentialsInput || hasFtpAdvancedInput;
    if (hasAnyFtpField) {
      if (!ftpHost || !ftpUsername || !ftpPassword) {
        return { status: "error", message: "Para actualizar FTP, completa Host, Usuario y Contraseña." };
      }

      rawData.r365Ftp = {
        host: ftpHost,
        port: ftpPort,
        username: ftpUsername,
        password: ftpPassword,
        secure: formData.get("ftpSecure") === "true",
        remotePath: ftpRemotePath || "/APImports/R365",
      };
    }

    const hasAnySettingsField = Boolean(settingsTemplate);
    if (hasAnySettingsField) {
      const snapshot = await getQboR365Snapshot(access.tenant.organizationId);
      rawData.settings = {
        template: settingsTemplate || "by_item",
        taxMode: snapshot.settings.taxMode,
        timezone: snapshot.settings.timezone,
        filePrefix: snapshot.settings.filePrefix,
        incrementalLookbackHours: snapshot.settings.incrementalLookbackHours,
        maxRetryAttempts: snapshot.settings.maxRetryAttempts,
        isEnabled: snapshot.settings.isEnabled,
      };
    }

    if (!hasAnyFtpField && !hasAnySettingsField) {
      return { status: "error", message: "No hay cambios para guardar." };
    }

    const parsed = qboR365ConfigUpsertSchema.safeParse(rawData);
    if (!parsed.success) {
      return { status: "error", message: "Los datos de configuración no son válidos." };
    }

    await upsertQboR365Config({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      payload: parsed.data,
    });

    revalidatePath("/app/integrations/quickbooks");
    return { status: "success", message: "Configuración guardada exitosamente." };
  } catch (error) {
    console.error("[saveIntegrationConfigAction]", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Error al guardar configuración.",
    };
  }
}
