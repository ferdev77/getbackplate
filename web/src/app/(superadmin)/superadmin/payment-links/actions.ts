"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";

// ── Cancel a pending order (marks as canceled, does not expire Stripe session) ──
export async function cancelManualPaymentOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) redirect("/superadmin/payment-links?status=error&message=ID+de+orden+inválido");

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("manual_payment_orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending"); // only cancel if still pending

  if (error) {
    redirect("/superadmin/payment-links?status=error&message=" + encodeURIComponent("No se pudo cancelar la orden"));
  }

  redirect("/superadmin/payment-links?status=success&message=" + encodeURIComponent("Orden cancelada"));
}
