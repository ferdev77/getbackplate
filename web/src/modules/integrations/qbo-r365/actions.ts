"use server";

import { revalidatePath } from "next/cache";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365Snapshot, upsertQboR365Config } from "@/modules/integrations/qbo-r365/service";
import { qboR365ConfigUpsertSchema } from "@/modules/integrations/qbo-r365/types";

export async function saveIntegrationConfigAction(formData: FormData) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return { status: "error", message: "Access denied." };
  }

  try {
    const ftpHost = String(formData.get("ftpHost") ?? "").trim();
    const ftpUsername = String(formData.get("ftpLogin") ?? formData.get("ftpUsername") ?? "").trim();
    const ftpPassword = String(formData.get("ftpSecret") ?? formData.get("ftpPassword") ?? "").trim();
    const ftpRemotePath = String(formData.get("ftpRemotePath") ?? "").trim();
    const ftpPortRaw = formData.get("ftpPort");
    const settingsTemplate = String(formData.get("settingsTemplate") ?? "").trim();
    const settingsLookbackRaw = formData.get("settingsLookbackHours");
    const settingsLookbackHours = settingsLookbackRaw ? Number(settingsLookbackRaw) : null;

    const rawData: Record<string, unknown> = {};

    const ftpPort = ftpPortRaw ? Number(ftpPortRaw) : 21;
    const hasFtpCredentialsInput = Boolean(ftpHost || ftpUsername || ftpPassword);
    const hasAnyFtpField = hasFtpCredentialsInput;
    if (hasAnyFtpField) {
      if (!ftpHost || !ftpUsername || !ftpPassword) {
        return { status: "error", message: "To update FTP, enter the host, username, and password." };
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

    const hasAnySettingsField = Boolean(settingsTemplate) || settingsLookbackHours !== null;
    if (hasAnySettingsField) {
      const snapshot = await getQboR365Snapshot(access.tenant.organizationId);
      rawData.settings = {
        template: settingsTemplate || snapshot.settings.template,
        taxMode: snapshot.settings.taxMode,
        timezone: snapshot.settings.timezone,
        filePrefix: snapshot.settings.filePrefix,
        incrementalLookbackHours: settingsLookbackHours ?? snapshot.settings.incrementalLookbackHours,
        maxRetryAttempts: snapshot.settings.maxRetryAttempts,
        isEnabled: snapshot.settings.isEnabled,
      };
    }

    if (!hasAnyFtpField && !hasAnySettingsField) {
      return { status: "error", message: "There are no changes to save." };
    }

    const parsed = qboR365ConfigUpsertSchema.safeParse(rawData);
    if (!parsed.success) {
      return { status: "error", message: "The configuration data is invalid." };
    }

    await upsertQboR365Config({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      payload: parsed.data,
    });

    revalidatePath("/app/integrations/quickbooks");
    return { status: "success", message: "Configuration saved successfully." };
  } catch (error) {
    console.error("[saveIntegrationConfigAction]", error);
    return {
      status: "error",
      message: "Unable to save the configuration. Please try again.",
    };
  }
}
