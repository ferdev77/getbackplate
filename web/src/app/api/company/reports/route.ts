import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { buildChecklistReportsSnapshot } from "@/modules/reports/services/checklist-reports-snapshot";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

export async function GET() {
  const moduleAccess = await assertCompanyAdminModuleApi("reports");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const supabase = await createSupabaseServerClient();
  const snapshot = await buildChecklistReportsSnapshot({
    supabase,
    organizationId: moduleAccess.tenant.organizationId,
  });

  return NextResponse.json(snapshot);
}
