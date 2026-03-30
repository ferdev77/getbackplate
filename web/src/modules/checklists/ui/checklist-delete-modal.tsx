"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteChecklistTemplateAction } from "@/modules/checklists/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

type ChecklistDeleteModalProps = {
  template: { id: string; name: string };
};

export function ChecklistDeleteModal({ template }: ChecklistDeleteModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteChecklistTemplateAction, { success: false, message: "" });

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        router.push("/app/checklists");
        router.refresh();
      } else {
        toast.error(state.message);
      }
    }
  }, [state, router]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="w-[520px] max-w-[95vw] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
        <div className="border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Eliminar checklist</p>
          <p className="mt-1 text-sm text-[var(--gbp-text2)]">Esta accion elimina la plantilla. Si tiene historial, se archivara automaticamente.</p>
        </div>
        <div className="px-6 py-4 text-sm text-[var(--gbp-text)]">Checklist: <strong>{template.name}</strong></div>
        <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
          <Link href="/app/checklists" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</Link>
          <form action={formAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <SubmitButton 
              label="Eliminar" 
              pendingLabel="Eliminando..." 
              pending={isPending}
              className="rounded-lg bg-[var(--gbp-error)] px-4 py-2 text-sm font-bold text-white hover:brightness-95"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
