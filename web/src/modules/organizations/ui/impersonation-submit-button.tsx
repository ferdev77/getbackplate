"use client";

import { Loader2, LogIn } from "lucide-react";
import { useFormStatus } from "react-dom";

import { TooltipLabel } from "@/shared/ui/tooltip";

export function ImpersonationSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-disabled={pending}
        aria-label={pending ? "Entrando a la organización" : "Ingresar a la organización"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 hover:scale-105 disabled:cursor-wait disabled:hover:scale-100 disabled:opacity-90"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      </button>
      <TooltipLabel label={pending ? "Entrando..." : "Ingresar a la organización"} />
    </>
  );
}
