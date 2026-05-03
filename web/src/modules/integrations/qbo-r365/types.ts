import { z } from "zod";

export const qboConfigSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500),
  redirectUri: z.string().trim().url().max(500),
  realmId: z.string().trim().min(1).max(120).optional(),
});

export const r365FtpConfigSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(21),
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(500),
  secure: z.boolean().default(true),
  remotePath: z.string().trim().min(1).max(500).default("/APImports/R365"),
});

export const qboR365SettingsSchema = z.object({
  template: z.enum(["by_item", "by_item_service_dates", "by_account", "by_account_service_dates"]).default("by_item"),
  taxMode: z.enum(["line", "header", "none"]).default("line"),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  filePrefix: z.string().trim().min(1).max(80).default("r365_multi_invoice"),
  incrementalLookbackHours: z.number().int().min(0).max(8760).default(24),
  maxRetryAttempts: z.number().int().min(0).max(10).default(3),
  isEnabled: z.boolean().default(false),
});

export const qboR365ConfigUpsertSchema = z.object({
  qbo: qboConfigSchema.optional(),
  r365Ftp: r365FtpConfigSchema.optional(),
  settings: qboR365SettingsSchema.optional(),
});

export type QboConfig = z.infer<typeof qboConfigSchema>;
export type R365FtpConfig = z.infer<typeof r365FtpConfigSchema>;
export type QboR365Settings = z.infer<typeof qboR365SettingsSchema>;
export type QboR365ConfigUpsertPayload = z.infer<typeof qboR365ConfigUpsertSchema>;

export type QboTokenSecrets = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAtEpochSec: number;
  realmId: string;
};

export type QboStoredSecrets = {
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  tokenType?: string;
  expiresAtEpochSec?: number;
};

export type FtpStoredSecrets = {
  password: string;
};

export type IntegrationProvider = "quickbooks_online" | "restaurant365_ftp";
