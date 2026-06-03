"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cancelManualPaymentOrderAction } from "./actions";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("order_id", orderId);
      const result = await cancelManualPaymentOrderAction(formData);
      if (result.ok) {
        toast.success("Orden cancelada");
      } else {
        toast.error(result.error ?? "No se pudo cancelar la orden");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[10px] font-bold text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancelar"}
    </button>
  );
}
