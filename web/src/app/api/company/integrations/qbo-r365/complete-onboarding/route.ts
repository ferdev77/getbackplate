import { NextRequest, NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

type VendorProfile = {
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};

export async function POST(req: NextRequest) {
  const access = await assertCompanyAdminModuleApi("settings", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { organizationId } = access.tenant;
  const body = (await req.json()) as { vendorProfile?: VendorProfile };

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      integration_vendor_profile: body.vendorProfile ?? null,
      integration_onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  if (error) {
    return NextResponse.json({ error: "No se pudo completar el onboarding" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
