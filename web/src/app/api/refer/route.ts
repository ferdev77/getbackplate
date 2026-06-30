import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { verifyReferralToken } from "@/modules/integrations/qbo-r365/services/referral-token";
import { sendVendorReferral } from "@/modules/integrations/qbo-r365/services/vendor-referral.service";

type ReferralBody = {
  token: string;
  vendorCompany: string;
  vendorContactName: string;
  vendorEmail: string;
  vendorPhone: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let body: ReferralBody;
  try {
    body = (await request.json()) as ReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, vendorCompany, vendorContactName, vendorEmail, vendorPhone } = body;

  if (!token || !vendorCompany?.trim() || !vendorContactName?.trim() || !vendorEmail?.trim() || !vendorPhone?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (!isValidEmail(vendorEmail.trim())) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (vendorCompany.trim().length > 200 || vendorContactName.trim().length > 200) {
    return NextResponse.json({ error: "Input too long" }, { status: 400 });
  }

  let organizationId: string;
  let syncConfigCustomerId: string;
  try {
    const payload = verifyReferralToken(token);
    organizationId = payload.organizationId;
    syncConfigCustomerId = payload.syncConfigCustomerId;
  } catch {
    return NextResponse.json({ error: "Invalid or expired referral link" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: customer } = await admin
    .from("qbo_r365_sync_config_customers")
    .select("qbo_customer_name, organization_id")
    .eq("id", syncConfigCustomerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: "Invalid referral link" }, { status: 400 });
  }

  const referrerBranchName = customer.qbo_customer_name as string;

  try {
    await sendVendorReferral({
      organizationId,
      syncConfigCustomerId,
      referrerBranchName,
      vendorCompany: vendorCompany.trim(),
      vendorContactName: vendorContactName.trim(),
      vendorEmail: vendorEmail.trim().toLowerCase(),
      vendorPhone: vendorPhone.trim(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send referral";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
