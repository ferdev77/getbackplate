import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { verifyQboReportPreferenceToken } from "./report-preference-token";

export const QBO_REPORT_FREQUENCIES = ["weekly", "monthly", "off"] as const;
export type QboReportFrequency = (typeof QBO_REPORT_FREQUENCIES)[number];
export type QboReportCadence = Exclude<QboReportFrequency, "off">;
export type QboReportTargetType = "organization" | "branch";
export type QboReportPreferenceSource = "public_link" | "report_service" | "superadmin";

export type QboReportSubscription = {
  id: string;
  organizationId: string;
  targetType: QboReportTargetType;
  targetId: string;
  recipientEmail: string;
  frequency: QboReportFrequency;
  tokenNonce: string;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  target_type: QboReportTargetType;
  target_id: string;
  recipient_email: string;
  frequency: QboReportFrequency;
  token_nonce: string;
  created_at: string;
  updated_at: string;
};

export function isQboReportFrequency(value: unknown): value is QboReportFrequency {
  return typeof value === "string" && QBO_REPORT_FREQUENCIES.includes(value as QboReportFrequency);
}

export function normalizeQboReportRecipientEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid report recipient email");
  }
  return normalized;
}

export function shouldSendQboReport(
  frequency: QboReportFrequency,
  cadence: QboReportCadence,
): boolean {
  return frequency === cadence;
}

function mapSubscription(row: SubscriptionRow): QboReportSubscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    targetType: row.target_type,
    targetId: row.target_id,
    recipientEmail: row.recipient_email,
    frequency: row.frequency,
    tokenNonce: row.token_nonce,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateQboReportSubscription(input: {
  organizationId: string;
  targetType: QboReportTargetType;
  targetId: string;
  recipientEmail: string;
  defaultFrequency: QboReportFrequency;
}): Promise<QboReportSubscription> {
  if (!isQboReportFrequency(input.defaultFrequency)) throw new Error("Invalid default report frequency");
  if (input.targetType === "organization" && input.targetId !== input.organizationId) {
    throw new Error("Invalid organization report target");
  }

  const recipientEmail = normalizeQboReportRecipientEmail(input.recipientEmail);
  const admin = createSupabaseAdminClient();
  if (input.targetType === "branch") {
    const { data: branch, error: branchError } = await admin
      .from("qbo_r365_sync_config_customers")
      .select("id")
      .eq("id", input.targetId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (branchError || !branch) throw new Error("Invalid branch report target");
  }

  const identity = {
    organization_id: input.organizationId,
    target_type: input.targetType,
    target_id: input.targetId,
    recipient_email: recipientEmail,
  };

  const { error: insertError } = await admin
    .from("qbo_report_subscriptions")
    .upsert({ ...identity, frequency: input.defaultFrequency }, {
      onConflict: "organization_id,target_type,target_id,recipient_email",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);

  const { data, error } = await admin
    .from("qbo_report_subscriptions")
    .select("id, organization_id, target_type, target_id, recipient_email, frequency, token_nonce, created_at, updated_at")
    .match(identity)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Report subscription not found");

  return mapSubscription(data as SubscriptionRow);
}

export async function getQboReportSubscriptionFromToken(token: string): Promise<QboReportSubscription> {
  const payload = verifyQboReportPreferenceToken(token);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_report_subscriptions")
    .select("id, organization_id, target_type, target_id, recipient_email, frequency, token_nonce, created_at, updated_at")
    .eq("id", payload.subscriptionId)
    .eq("token_nonce", payload.nonce)
    .maybeSingle();

  if (error || !data) throw new Error("This preferences link is invalid");
  return mapSubscription(data as SubscriptionRow);
}

export async function updateQboReportPreference(input: {
  subscriptionId: string;
  frequency: QboReportFrequency;
  source?: QboReportPreferenceSource;
  expectedTokenNonce?: string;
}): Promise<QboReportSubscription> {
  if (!isQboReportFrequency(input.frequency)) throw new Error("Invalid report frequency");

  const admin = createSupabaseAdminClient();
  if (input.expectedTokenNonce) {
    const { data: current, error: currentError } = await admin
      .from("qbo_report_subscriptions")
      .select("id, organization_id, target_type, target_id, recipient_email, frequency, token_nonce, created_at, updated_at")
      .eq("id", input.subscriptionId)
      .eq("token_nonce", input.expectedTokenNonce)
      .maybeSingle();
    if (currentError || !current) throw new Error("Report preference could not be updated");
    if (current.frequency === input.frequency) return mapSubscription(current as SubscriptionRow);

  }

  const { data, error } = await admin.rpc("update_qbo_report_preference", {
    p_subscription_id: input.subscriptionId,
    p_frequency: input.frequency,
    p_source: input.source ?? "report_service",
    p_expected_token_nonce: input.expectedTokenNonce ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "Report preference could not be updated");

  return mapSubscription(data as unknown as SubscriptionRow);
}
