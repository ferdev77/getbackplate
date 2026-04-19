"use client";

import { useActionState, useEffect } from "react";
import { useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteChecklistTemplateAction } from "@/modules/checklists/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

type ChecklistDeleteModalProps = {
  template: { id: string; name: string };
  submitEndpoint?: string;
  redirectPath?: string;
  onSubmitted?: () => void;
};

export function ChecklistDeleteModal({ template, submitEndpoint, redirectPath = "/app/checklists", onSubmitted }: ChecklistDeleteModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteChecklistTemplateAction, { success: false, message: "" });
  const [isApiPending, setIsApiPending] = useState(false);

  useEffect(() => {
    if (submitEndpoint) return;
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        onSubmitted?.();
        router.push(redirectPath);
        router.refresh();
      } else {
        toast.error(state.message);
      }
    }
  }, [onSubmitted, redirectPath, router, state, submitEndpoint]);

  async function handleApiDelete() {
    if (!submitEndpoint || isApiPending) return;
    setIsApiPending(true);
    try {
      const response = await fetch(submitEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo eliminar checklist");
      }
      toast.success("Checklist eliminado");
      startTransition(() => {
        onSubmitted?.();
        router.push(redirectPath);
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar checklist");
    } finally {
      setIsApiPending(false);
    }
  }

  const pending = submitEndpoint ? isApiPending : isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="w-[520px] max-w-[95vw] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
        <div className="border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Eliminar checklist</p>
          <p className="mt-1 text-sm text-[var(--gbp-text2)]">Esta acción elimina la plantilla. Si tiene historial, se archivará automáticamente.</p>
        </div>
        <div className="px-6 py-4 text-sm text-[var(--gbp-text)]">Checklist: <strong>{template.name}</strong></div>
        <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
          <Link href={redirectPath} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</Link>
          {submitEndpoint ? (
            <button
              type="button"
              onClick={() => void handleApiDelete()}
              disabled={pending}
              className="rounded-lg bg-[var(--gbp-error)] px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-70"
              data-testid="confirm-delete-checklist-btn"
            >
              {pending ? "Eliminando..." : "Eliminar"}
            </button>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="template_id" value={template.id} />
              <SubmitButton 
                label="Eliminar" 
                pendingLabel="Eliminando..." 
                pending={pending}
                className="rounded-lg bg-[var(--gbp-error)] px-4 py-2 text-sm font-bold text-white hover:brightness-95"
                data-testid="confirm-delete-checklist-btn"
              />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
