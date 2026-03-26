"use client";

import { useState, startTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubmitButton } from "@/shared/ui/submit-button";

type NewUserModalProps = {
  open: boolean;
  branches: { id: string; name: string }[];
  roleOptions: { value: string; label: string }[];
};

const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2] [.theme-dark-pro_&]:hover:bg-[#172131]";

export function NewUserModal({ open, branches, roleOptions }: NewUserModalProps) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/company/users", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear usuario");
      }

      toast.success("Usuario creado correctamente");
      startTransition(() => {
        router.refresh();
        router.push("/app/users");
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear usuario");
    } finally {
      setIsPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className={`max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)] ${DARK_PANEL}`}>
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5 [.theme-dark-pro_&]:border-[#2b3646]">
          <p className={`font-serif text-[15px] font-bold text-[#111] ${DARK_TEXT}`}>Nuevo Administrador</p>
          <Link
            id="close-user-modal-link"
            href="/app/users"
            className={`grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] ${DARK_GHOST}`}
          >
            ✕
          </Link>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">

            {/* Nombre */}
            <label className={`mb-1 mt-0 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Nombre completo
            </label>
            <input
              name="full_name"
              required
              className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}
              placeholder="ej. Juan Garcia"
            />

            {/* Email */}
            <label className={`mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Correo corporativo
            </label>
            <input
              name="email"
              type="email"
              required
              className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}
              placeholder="nombre@empresa.com"
            />

            {/* Password */}
            <label className={`mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Contraseña inicial
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}
              placeholder="Mínimo 8 caracteres"
            />

            {/* Tipo de administrador */}
            <label className={`mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Tipo de administrador
            </label>
            <select name="role_code" defaultValue={roleOptions[0]?.value ?? ""} className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            {/* Locacion */}
            <label className={`mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Locación
            </label>
            <select name="branch_id" defaultValue="" className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}>
              <option value="">Sin locación asignada</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            {/* Acceso */}
            <label className={`mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>
              Acceso a plataforma
            </label>
            <select name="access_status" defaultValue="active" className={`w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
            <p className={`mt-1 text-[11px] text-[#8b817c] ${DARK_MUTED}`}>Este campo define si puede iniciar sesión en la plataforma.</p>

          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]">
            <Link
              href="/app/users"
              className={`rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333] ${DARK_GHOST}`}
            >
              Cancelar
            </Link>
            <SubmitButton
              label="Crear Administrador"
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
