import { NextResponse, after } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { nombreDeLaLocacion } from "@/modules/maintenance/lib/location-label";
import { estadoEnPalabras } from "@/modules/maintenance/lib/labels";
import {
  notifyMaintenanceResponseByEmail,
  notifyMaintenanceStatusChanged,
  notifyMaintenanceUpdate,
} from "@/modules/maintenance/services/maintenance-events.service";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { addMaintenanceUpdate, maintenanceUpdateSchema } from "@/modules/maintenance/services";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const access = await assertCompanyAdminModuleApi("maintenance");
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
      .select("title, created_by, branch_id")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", id)
      .maybeSingle();

    after(async () => {
      const admin = createSupabaseAdminClient();
      const branchId = solicitud.data?.branch_id ?? null;
      const comun = {
        supabase: admin,
        organizationId: access.tenant.organizationId,
        title: solicitud.data?.title ?? "Solicitud",
        branchId,
        locationName: await nombreDeLaLocacion(admin, access.tenant.organizationId, branchId),
        requestedByUserId: solicitud.data?.created_by ?? null,
        actorUserId: access.userId,
      };

      // Un cambio de estado y una novedad son avisos distintos: el primero dice
      // en que quedo, el segundo que hay algo para leer.
      if (parsed.data.status) {
        await notifyMaintenanceStatusChanged({ ...comun, toStatus: parsed.data.status });
      } else {
        await notifyMaintenanceUpdate({
          ...comun,
          message: parsed.data.message ?? null,
          scheduledVisitAt: parsed.data.scheduled_visit_at ?? null,
        });
      }

      // El push/campanita ya llega siempre -- el email es aparte, solo si lo
      // tildaron a proposito (un email por cada comentario seria demasiado).
      if (parsed.data.send_email) {
        const cuerpoEmail = parsed.data.status
          ? `Pasó a ${estadoEnPalabras(parsed.data.status)}${parsed.data.message ? ` — ${parsed.data.message}` : ""}`
          : parsed.data.scheduled_visit_at
            ? `Visita programada para el ${parsed.data.scheduled_visit_at}`
            : (parsed.data.message ?? "Hay una novedad");

        await notifyMaintenanceResponseByEmail({
          supabase: admin,
          organizationId: access.tenant.organizationId,
          branchId,
          title: comun.title,
          body: cuerpoEmail,
          actorUserId: access.userId,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al responder request" }, { status: 500 });
  }
}
