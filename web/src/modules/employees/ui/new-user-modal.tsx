"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUserAccountAction } from "@/modules/employees/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

type NewUserModalProps = {
  open: boolean;
  branches: { id: string; name: string }[];
  roleOptions: { value: string; label: string }[];
};

const initialState = { success: false, message: "" };

export function NewUserModal({ open, branches }: NewUserModalProps) {
  const [state, formAction, isPending] = useActionState(createUserAccountAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state?.message) {
      if (state.success) {
        toast.success(state.message);
        router.refresh();
        router.push("/app/users");
        const closeLink = document.getElementById("close-user-modal-link");
        if (closeLink) (closeLink as HTMLAnchorElement).click();
      } else {
        toast.error(state.message);
      }
    }
  }, [state, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">Nuevo Usuario</p>
          <Link
            id="close-user-modal-link"
            href="/app/users"
            className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]"
          >
            ✕
          </Link>
        </div>
        <form action={formAction}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">

            {/* Nombre */}
            <label className="mb-1 mt-0 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Nombre completo
            </label>
            <input
              name="full_name"
              required
              className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
              placeholder="ej. Juan Garcia"
            />

            {/* Email */}
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

            {/* Password */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Contraseña inicial
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
              placeholder="Mínimo 8 caracteres"
            />

            {/* Tipo de usuario */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Tipo de usuario
            </label>
            <select name="role_code" defaultValue="employee" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              <option value="employee">Empleado</option>
              <option value="company_admin">Administrador</option>
            </select>

            {/* Locacion */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">
              Locación
            </label>
            <select name="branch_id" defaultValue="" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              <option value="">Sin locación asignada</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            {/* Acceso */}
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
              href="/app/users"
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
