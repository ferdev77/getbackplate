"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UserDepartmentPositionFields } from "./user-department-position-fields";
import { createUserAccountAction } from "@/modules/employees/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

type NewUserModalProps = {
  open: boolean;
  branches: { id: string; name: string }[];
  roleOptions: { value: string; label: string }[];
  departments: { id: string; name: string }[];
  positions: { id: string; department_id: string; name: string; is_active: boolean }[];
};

const initialState = { success: false, message: "" };

export function NewUserModal({ open, branches, roleOptions, departments, positions }: NewUserModalProps) {
  const [state, formAction, isPending] = useActionState(createUserAccountAction, initialState);

  useEffect(() => {
    if (state?.message) {
      if (state.success) {
        toast.success(state.message);
        // We simulate a click to close the modal by navigating back
        const closeLink = document.getElementById("close-user-modal-link");
        if (closeLink) {
          closeLink.click();
        }
      } else {
        toast.error(state.message);
      }
    }
  }, [state]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">Nuevo Usuario</p>
          <Link
            id="close-user-modal-link"
            href="/app/employees"
            className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]"
          >
            ✕
          </Link>
        </div>
        <form action={formAction}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <label className="mb-1 mt-0 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Nombre completo
            </label>
            <input
              name="full_name"
              required
              className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
              placeholder="ej. Juan Garcia"
            />
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Correo corporativo
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
              placeholder="nombre@empresa.com"
            />
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Contrasena inicial
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
              placeholder="Minimo 8 caracteres"
            />
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Locacion
            </label>
            <select name="branch_id" defaultValue="" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              <option value="">Todas las locaciones</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Puesto / Departamento
            </label>
            <select name="role_code" defaultValue="employee" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <UserDepartmentPositionFields departments={departments} positions={positions} />
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Acceso de usuario
            </label>
            <select name="access_status" defaultValue="active" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              <option value="active">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
            <Link
              href="/app/employees"
              className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]"
            >
              Cancelar
            </Link>
            <SubmitButton
              label="Crear Usuario"
              pendingLabel="Creando..."
              pending={isPending}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
