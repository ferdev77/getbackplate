"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ["status", "assignment", "notes", "verification"] as const;
const STATUSES = ["open", "verifying", "in_progress", "resolved", "rejected"] as const;

type SupportAction = (typeof ACTIONS)[number];
type ActionResult = { ok: true } | { ok: false; error: string };

export async function manageSupportRequestAction(
  requestId: string,
  action: SupportAction,
  value: string | null,
): Promise<ActionResult> {
  await requireSuperadmin();

  if (!UUID_RE.test(requestId) || !ACTIONS.includes(action)) {
    return { ok: false, error: "Solicitud inválida" };
  }
  if (action === "status" && !STATUSES.includes(value as (typeof STATUSES)[number])) {
    return { ok: false, error: "Estado inválido" };
  }
  if (action === "assignment" && value && !UUID_RE.test(value)) {
    return { ok: false, error: "Asignación inválida" };
  }
  if (action === "notes" && (value?.length ?? 0) > 10_000) {
    return { ok: false, error: "Las notas no pueden superar 10.000 caracteres" };
  }
  if (action === "verification" && value !== "true" && value !== "false") {
    return { ok: false, error: "Verificación inválida" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_support_request", {
    p_request_id: requestId,
    p_action: action,
    p_value: value,
  });

  if (error) {
    const message = error.message.includes("Identity verification")
      ? "Verificá la identidad antes de procesar o resolver esta solicitud"
      : error.message;
    return { ok: false, error: message };
  }

  revalidatePath("/superadmin/feedback");
  revalidatePath("/superadmin", "layout");
  return { ok: true };
}
