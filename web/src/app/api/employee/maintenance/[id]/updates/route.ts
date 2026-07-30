import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  notifyMaintenanceStatusChanged,
  notifyMaintenanceUpdate,
} from "@/modules/maintenance/services/maintenance-events.service";

import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { addMaintenanceUpdate, maintenanceUpdateSchema } from "@/modules/maintenance/services";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const access = await assertEmployeeCapabilityApi("maintenance", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = maintenanceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;

  try {
    await addMaintenanceUpdate(
      {
        organizationId: access.tenant.organizationId,
        userId: access.userId,
        branchId: access.tenant.branchId,
        roleCode: access.tenant.roleCode,
      },
      id,
      parsed.data,
    );

    const solicitud = await createSupabaseAdminClient()
      .from("maintenance_requests")
      .select("title, created_by")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", id)
      .maybeSingle();

    after(async () => {
      const admin = createSupabaseAdminClient();
      const comun = {
        supabase: admin,
        organizationId: access.tenant.organizationId,
        title: solicitud.data?.title ?? "Solicitud",
        requestedByUserId: solicitud.data?.created_by ?? null,
        actorUserId: access.userId,
      };

      // Un cambio de estado y una novedad son avisos distintos: el primero dice
      // en que quedo, el segundo que hay algo para leer.
      if (parsed.data.status) {
        await notifyMaintenanceStatusChanged({ ...comun, toStatus: parsed.data.status });
        return;
      }

      await notifyMaintenanceUpdate({
        ...comun,
        message: parsed.data.message ?? null,
        scheduledVisitAt: parsed.data.scheduled_visit_at ?? null,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al responder request" }, { status: 500 });
  }
}
