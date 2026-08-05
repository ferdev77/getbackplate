import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

/**
 * Como se llama la persona que hizo algo, para poder nombrarla en un aviso.
 *
 * El nombre de alguien vive en tres lugares distintos segun como haya entrado a
 * la organizacion, y ninguno alcanza solo:
 *
 * 1. `employees` -- el legajo, que tiene la gente del portal.
 * 2. `organization_user_profiles` -- los admins y demas usuarios del panel.
 * 3. El metadata de la cuenta -- para quien no tiene ni legajo ni perfil.
 *
 * Si no hay nombre en ninguno se usa lo que esta antes del @ del mail, que es
 * preferible a no decir nada. `fallback` es el ultimo recurso: cada modulo elige
 * el suyo ("Administrador", "Dirección") o lo deja afuera para no inventar.
 */

type ActorNameRow = {
  user_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

function nombreVisible(
  value: { first_name?: string | null; last_name?: string | null; email?: string | null },
  fallback: string | null,
) {
  const nombreCompleto = `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim();
  if (nombreCompleto) return nombreCompleto;
  if (value.email && value.email.includes("@")) {
    return value.email.split("@")[0] ?? value.email;
  }
  return fallback;
}

export async function resolveActorNames(params: {
  organizationId: string;
  userIds: string[];
  /** Que decir de quien no tiene nombre en ningun lado. Sin esto, no entra al mapa. */
  fallback?: string | null;
}) {
  const fallback = params.fallback ?? null;
  const porUserId = new Map<string, string>();

  const userIds = [...new Set(params.userIds.filter(Boolean))];
  if (!userIds.length) return porUserId;

  const admin = createSupabaseAdminClient();
  const [{ data: employeesData }, { data: profilesData }] = await Promise.all([
    admin
      .from("employees")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", userIds),
    admin
      .from("organization_user_profiles")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", userIds),
  ]);

  const anotar = (row: ActorNameRow) => {
    if (!row.user_id || porUserId.has(row.user_id)) return;
    const nombre = nombreVisible(row, fallback);
    if (nombre) porUserId.set(row.user_id, nombre);
  };

  for (const row of (employeesData ?? []) as ActorNameRow[]) anotar(row);
  for (const row of (profilesData ?? []) as ActorNameRow[]) anotar(row);

  const faltantes = userIds.filter((id) => !porUserId.has(id));
  if (!faltantes.length) return porUserId;

  const cuentas = await Promise.all(
    faltantes.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      return { userId, user: data.user };
    }),
  );

  for (const cuenta of cuentas) {
    if (!cuenta) continue;
    const meta = cuenta.user.user_metadata as Record<string, unknown> | null;
    const nombreCompleto = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
    const nombre = nombreCompleto || nombreVisible({ email: cuenta.user.email }, fallback);
    if (nombre) porUserId.set(cuenta.userId, nombre);
  }

  return porUserId;
}

/** Lo mismo para una sola persona, que es el caso de casi todos los avisos. */
export async function nombreDelActor(
  organizationId: string,
  userId: string | null,
  fallback?: string | null,
) {
  if (!userId) return null;
  const nombres = await resolveActorNames({ organizationId, userIds: [userId], fallback });
  return nombres.get(userId) ?? null;
}
