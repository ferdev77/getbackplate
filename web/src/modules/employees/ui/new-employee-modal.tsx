"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/shared/ui/submit-button";

import { createEmployeeAction } from "@/modules/employees/actions";

type ModalBranch = { id: string; name: string };
type ModalDocument = { id: string; title: string; created_at: string };
type ModalDepartment = { id: string; name: string };
type ModalPosition = { id: string; department_id: string; name: string; is_active: boolean };

type NewEmployeeModalProps = {
  open: boolean;
  branches: ModalBranch[];
  departments: ModalDepartment[];
  positions: ModalPosition[];
  publisherName: string;
  mode?: "create" | "edit";
  initialEmployee?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    branch_id: string;
    department_id: string;
    position_id: string;
    document_id: string | null;
    document_number: string | null;
    personal_email: string | null;
    phone: string | null;
    address: string | null;
    birth_date: string | null;
    hire_date: string | null;
    contract_type: string | null;
    contract_signed_at: string | null;
    contract_signer_name: string | null;
  };
  recentDocuments?: ModalDocument[];
};

export function NewEmployeeModal({
  open,
  branches,
  departments,
  positions,
  publisherName,
  mode = "create",
  initialEmployee,
  recentDocuments = [],
}: NewEmployeeModalProps) {
  const [state, formAction, isActionPending] = useActionState(createEmployeeAction, { success: false, message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        // We don't necessarily close here because the modal is managed by URL, 
        // but we can at least signal success.
      } else {
        toast.error(state.message);
      }
    }
  }, [state]);

  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches]);

  const [selectedDept, setSelectedDept] = useState(initialEmployee?.department_id ?? "");

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => p.department_id === selectedDept);
  }, [positions, selectedDept]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[980px] max-w-[96vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex shrink-0 items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">{mode === "edit" ? "Editar Empleado" : "Nuevo Empleado"}</p>
          <Link href="/app/employees" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
        </div>

        <form action={formAction} className="flex flex-col overflow-hidden">
          {mode === "edit" && initialEmployee ? <input type="hidden" name="employee_id" value={initialEmployee.id} /> : null}
          <div className="max-h-[72vh] overflow-y-auto px-6 py-6 pb-4">
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Datos Personales</h3>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre</span>
                    <input name="first_name" required defaultValue={initialEmployee?.first_name ?? ""} placeholder="ej. Juan" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Apellido</span>
                    <input name="last_name" required defaultValue={initialEmployee?.last_name ?? ""} placeholder="ej. Garcia" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email Personal</span>
                    <input name="personal_email" type="email" defaultValue={initialEmployee?.personal_email ?? ""} placeholder="juan.garcia@gmail.com" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Telefono</span>
                    <input name="phone" defaultValue={initialEmployee?.phone ?? ""} placeholder="+54 9 11..." className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha de Nacimiento</span>
                    <input name="birth_date" type="date" defaultValue={initialEmployee?.birth_date ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Direccion</span>
                    <input name="address" defaultValue={initialEmployee?.address ?? ""} placeholder="Calle, Altura, Localidad..." className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Assignación Laboral</h3>
                <div className="grid gap-3.5 sm:grid-cols-2">
                   <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Locación / Sucursal</span>
                    <select name="branch_id" required defaultValue={initialEmployee?.branch_id ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]">
                      <option value="" disabled>Selecciona una sucursal</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Departamento</span>
                    <select 
                      name="department_id" 
                      required 
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"
                    >
                      <option value="" disabled>Selecciona...</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Puesto Principal</span>
                    <select name="position_id" required defaultValue={initialEmployee?.position_id ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]">
                      <option value="" disabled>Selecciona departamento primero</option>
                      {filteredPositions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha de Ingreso</span>
                    <input name="hire_date" type="date" required defaultValue={initialEmployee?.hire_date ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Tipo de Contrato</span>
                    <select name="contract_type" defaultValue={initialEmployee?.contract_type ?? "indefinite"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]">
                      <option value="indefinite">Indeterminado</option>
                      <option value="fixed_term">Plazo fijo</option>
                      <option value="seasonal">Temporada</option>
                      <option value="internship">Pasantía</option>
                    </select>
                  </label>
                </div>
              </section>
            </div>

            <section className="mb-2">
              <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Documentación Legal</h3>
              <div className="grid gap-3.5 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Tipo de ID</span>
                  <select name="document_id" defaultValue={initialEmployee?.document_id ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]">
                    <option value="">Selecciona...</option>
                    <option value="dni">DNI</option>
                    <option value="cuil">CUIL / CUIT</option>
                    <option value="passport">Pasaporte</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Número de ID</span>
                  <input name="document_number" defaultValue={initialEmployee?.document_number ?? ""} placeholder="00.000.000" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email Corporativo (Login)</span>
                  <input name="email" type="email" required defaultValue={initialEmployee?.email ?? ""} placeholder="p.ejemplo@empresa.com" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 py-2 text-[13px] font-semibold text-brand" />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Firmante Contrato</span>
                  <input name="contract_signer_name" defaultValue={initialEmployee?.contract_signer_name ?? ""} placeholder="Nombre completo" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha de firma</span>
                  <input name="contract_signed_at" type="date" defaultValue={initialEmployee?.contract_signed_at ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-3.5">
            <Link href="/app/employees" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</Link>
            <SubmitButton
              label={mode === "edit" ? "Actualizar Empleado" : "Guardar Empleado"}
              pendingLabel={mode === "edit" ? "Actualizando..." : "Guardando..."}
              pending={isActionPending || saving}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
