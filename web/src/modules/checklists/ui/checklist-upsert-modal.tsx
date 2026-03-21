"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ChecklistItemsBuilder } from "@/modules/checklists/ui/checklist-items-builder";
import { createChecklistTemplateAction } from "@/modules/checklists/actions";

type BranchOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string };
type PositionOption = { id: string; department_id: string; name: string };
type UserOption = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  role_label?: string;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

type EditingTemplate = {
  id: string;
  name?: string;
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: string[] }>;
  templateItems?: Array<{ label: string }>;
};

type ChecklistUpsertModalProps = {
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: UserOption[];
  action?: string;
  editingTemplate?: EditingTemplate | null;
};

export function ChecklistUpsertModal({
  branches,
  departments,
  positions,
  users,
  action,
  editingTemplate,
}: ChecklistUpsertModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createChecklistTemplateAction, { success: false, message: "" });
  const [notifyEmail, setNotifyEmail] = useState(true);

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
      <div className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 pb-4 pt-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">{action === "edit" ? "Editar Checklist" : "Nuevo Checklist"}</p>
          <Link href="/app/checklists" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
        </div>
        <form action={formAction}>
          {editingTemplate ? <input type="hidden" name="template_id" value={editingTemplate.id} /> : null}
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Informacion general</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre del checklist</span>
                <input name="name" required defaultValue={editingTemplate?.name ?? ""} placeholder="Ej: Apertura Cocina - Turno Manana" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Tipo de checklist</span>
                <select name="checklist_type" defaultValue={editingTemplate?.checklist_type ?? "opening"} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm">
                  <option value="opening">Apertura</option>
                  <option value="closing">Cierre</option>
                  <option value="prep">Prep</option>
                  <option value="custom">Otro</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Shift</span>
                <select name="shift" defaultValue={editingTemplate?.shift ?? "1er Shift"} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm">
                  <option>1er Shift</option>
                  <option>2do Shift</option>
                  <option>3er Shift</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Frecuencia</span>
                <select name="repeat_every" defaultValue={editingTemplate?.repeat_every ?? "daily"} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm">
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Estado</span>
                <select name="template_status" defaultValue={editingTemplate?.is_active ? "active" : "draft"} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm">
                  <option value="active">Activo</option>
                  <option value="draft">Borrador</option>
                </select>
              </label>
            </div>
            <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Visible para</h3>
            <ScopeSelector
              namespace="checklist"
              branches={branches}
              departments={departments}
              positions={positions}
              users={users}
              locationInputName="location_scope"
              departmentInputName="department_scope"
              positionInputName="position_scope"
              userInputName="user_scope"
              initialLocations={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.locations) ? ((editingTemplate?.target_scope as Record<string, string[]>).locations ?? []) : []}
              initialDepartments={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.department_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).department_ids ?? []) : []}
              initialPositions={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.position_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).position_ids ?? []) : []}
              initialUsers={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.users) ? ((editingTemplate?.target_scope as Record<string, string[]>).users ?? []) : []}
            />
            <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Items del checklist</h3>
            <ChecklistItemsBuilder
              initialSections={
                editingTemplate?.templateSections?.length
                  ? editingTemplate.templateSections
                  : [{ name: "General", items: editingTemplate?.templateItems?.map((item) => item.label) ?? [""] }]
              }
            />

            {!editingTemplate ? (
              <>
                <div className="my-4 h-px bg-[#f0f0f0]" />
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Notificar tambien via</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyEmail((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyEmail
                        ? "border-[#c0392b] bg-[#fff5f3] text-[#c0392b]"
                        : "border-[#e8e8e8] bg-white text-[#666]"
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </button>
                </div>
                {notifyEmail ? <input type="hidden" name="notify_channel" value="email" /> : null}
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
            <Link href="/app/checklists" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</Link>
            <SubmitButton 
              label={editingTemplate ? "Actualizar Checklist" : "Guardar Checklist"} 
              pendingLabel={editingTemplate ? "Actualizando..." : "Guardando..."} 
              pending={isPending}
              className="px-5 py-2 text-sm font-bold" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
