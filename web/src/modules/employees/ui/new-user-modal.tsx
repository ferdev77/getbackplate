"use client";

import { useState, startTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubmitButton } from "@/shared/ui/submit-button";

type NewUserModalProps = {
  open: boolean;
  onClose?: () => void;
  branches: { id: string; name: string }[];
  roleOptions: { value: string; label: string }[];
};

export function NewUserModal({ open, onClose, branches, roleOptions }: NewUserModalProps) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push("/app/users");
  };

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
      <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Nuevo Administrador</p>
          <button
            type="button"
            id="close-user-modal-link"
            onClick={handleClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">

            {/* Nombre */}
            <label className="mb-1 mt-0 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Nombre completo
            </label>
            <input
              name="full_name"
              required
              className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              placeholder="ej. Juan Garcia"
            />

            {/* Email */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Correo corporativo
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              placeholder="nombre@empresa.com"
            />

            {/* Password */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Contraseña inicial
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              placeholder="Mínimo 8 caracteres"
            />

            {/* Tipo de administrador */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Tipo de administrador
            </label>
            <select name="role_code" defaultValue={roleOptions[0]?.value ?? ""} className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]">
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            {/* Locacion */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Locación
            </label>
            <select name="branch_id" defaultValue="" className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]">
              <option value="">Sin locación asignada</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            {/* Acceso */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
              Acceso a plataforma
            </label>
            <select name="access_status" defaultValue="active" className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
            <p className="mt-1 text-[11px] text-[var(--gbp-text2)]">Este campo define si puede iniciar sesión en la plataforma.</p>

          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
            >
              Cancelar
            </button>
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
