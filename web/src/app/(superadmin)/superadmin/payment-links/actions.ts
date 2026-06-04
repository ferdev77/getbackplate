"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";
import { requireSuperadmin } from "@/shared/lib/access";

export async function cancelManualPaymentOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { data: order } = await supabase
    .from("manual_payment_orders")
    .select("id, status, stripe_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.status !== "pending") {
    revalidatePath("/superadmin/payment-links");
    return { ok: true };
  }

  if (order.stripe_session_id) {
    try {
      await stripe.checkout.sessions.expire(order.stripe_session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canIgnore = message.includes("already expired") || message.includes("already completed");
      if (!canIgnore) {
        return { ok: false, error: "No se pudo expirar la sesión de Stripe" };
      }
    }
  }

  const { error } = await supabase
    .from("manual_payment_orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "No se pudo cancelar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function deleteManualPaymentOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("manual_payment_orders")
    .delete()
    .eq("id", orderId)
    .neq("status", "paid"); // never delete paid orders

  if (error) return { ok: false, error: "No se pudo eliminar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}
