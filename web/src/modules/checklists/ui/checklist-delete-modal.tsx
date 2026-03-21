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

const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2] [.theme-dark-pro_&]:hover:bg-[#172131]";

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
      <div className={`w-[520px] max-w-[95vw] rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)] ${DARK_PANEL}`}>
        <div className="border-b-[1.5px] border-[#f0f0f0] px-6 py-5 [.theme-dark-pro_&]:border-[#2b3646]">
          <p className={`font-serif text-[15px] font-bold text-[#111] ${DARK_TEXT}`}>Eliminar checklist</p>
          <p className={`mt-1 text-sm text-[#6d6460] ${DARK_MUTED}`}>Esta accion elimina la plantilla. Si tiene historial, se archivara automaticamente.</p>
        </div>
        <div className={`px-6 py-4 text-sm text-[#2f2b28] ${DARK_TEXT}`}>Checklist: <strong>{template.name}</strong></div>
        <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]">
          <Link href="/app/checklists" className={`rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333] ${DARK_GHOST}`}>Cancelar</Link>
          <form action={formAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <SubmitButton 
              label="Eliminar" 
              pendingLabel="Eliminando..." 
              pending={isPending}
              className="rounded-lg bg-[#8c2e24] px-4 py-2 text-sm font-bold text-white hover:bg-[#6f251e]"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
