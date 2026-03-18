"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
    document_type: string | null;
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
  const [selectedDept, setSelectedDept] = useState(initialEmployee?.department_id ?? "");
  // Toggle for creating a user account alongside the employee
  const [createAccount, setCreateAccount] = useState(false);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        router.refresh();
        router.push("/app/employees");
      } else {
        toast.error(state.message);
      }
    }
  }, [state, router]);

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => p.department_id === selectedDept && p.is_active);
  }, [positions, selectedDept]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex h-full max-h-[90vh] w-full max-w-[850px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#f0d5d0] bg-[#fff5f3]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#111]" style={{ fontFamily: 'Georgia, serif' }}>
              {mode === "edit" ? "Editar Empleado" : "Nuevo Empleado"}
            </h2>
          </div>
          <Link href="/app/employees" className="flex h-8 w-8 items-center justify-center rounded-full text-[#999] hover:bg-gray-100 hover:text-black transition-colors">
            <span className="text-xl">✕</span>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#f0f0f0] bg-[#fafafa] px-6">
          {[
            "Info Personal",
            "Documentos",
            "Contrato & Salario",
            "Cuenta (App)",
          ].map((tab, idx) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`border-b-2 px-4 py-4 text-sm font-semibold transition-all ${
                activeTab === idx
                  ? "border-brand text-brand"
                  : "border-transparent text-[#888] hover:text-[#555]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mode === "edit" && initialEmployee ? (
            <input type="hidden" name="employee_id" value={initialEmployee.id} />
          ) : null}
          <input type="hidden" name="create_mode" value={createAccount ? "with_account" : "without_account"} />

          <div className="flex-1 overflow-y-auto bg-[#fdfdfd] p-8">
            {/* TAB 0 - Info Personal */}
            <div className={activeTab === 0 ? "block" : "hidden"}>
              <h3 className="mb-4 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Información Personal
              </h3>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Nombre(s) *</label>
                  <input
                    name="first_name"
                    required
                    defaultValue={initialEmployee?.first_name ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="Juan"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Apellidos</label>
                  <input
                    name="last_name"
                    defaultValue={initialEmployee?.last_name ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="García López"
                  />
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Fecha Nacimiento</label>
                  <input
                    name="birth_date"
                    type="date"
                    defaultValue={initialEmployee?.birth_date ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Tipo de Documento</label>
                  <select
                    name="document_type"
                    defaultValue={initialEmployee?.document_type ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">—</option>
                    <option value="dni">DNI</option>
                    <option value="cuil">CUIL / CUIT</option>
                    <option value="ssn">SSN / ITIN</option>
                    <option value="passport">Pasaporte</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Número de Documento</label>
                  <input
                    name="document_number"
                    defaultValue={initialEmployee?.document_number ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="00.000.000"
                  />
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Teléfono</label>
                  <input
                    name="phone"
                    defaultValue={initialEmployee?.phone ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="+1 228 555 0000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Email Personal</label>
                  <input
                    name="personal_email"
                    type="email"
                    defaultValue={initialEmployee?.personal_email ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="juan@email.com"
                  />
                </div>
              </div>

              <h3 className="mb-4 mt-8 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Dirección
              </h3>
              <div className="mb-6">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Dirección Completa</label>
                  <input
                    name="address"
                    defaultValue={initialEmployee?.address ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="Calle, Número, Ciudad, Estado, País"
                  />
                </div>
              </div>

              <h3 className="mb-4 mt-8 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Información Laboral
              </h3>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Email Corporativo</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={initialEmployee?.email ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="p.ej@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Locación / Sucursal</label>
                  <select
                    name="branch_id"
                    defaultValue={initialEmployee?.branch_id ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona locación —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Departamento</label>
                  <select
                    name="department_id"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona departamento —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Puesto</label>
                  <select
                    name="position_id"
                    defaultValue={initialEmployee?.position_id ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">
                      {selectedDept ? "— Selecciona un puesto —" : "Selecciona departamento primero"}
                    </option>
                    {filteredPositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Fecha de Ingreso</label>
                  <input
                    name="hire_date"
                    type="date"
                    defaultValue={initialEmployee?.hire_date ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Tipo Contrato</label>
                  <select
                    name="contract_type"
                    defaultValue={initialEmployee?.contract_type ?? "indefinite"}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">—</option>
                    <option value="indefinite">Indeterminado</option>
                    <option value="fixed_term">Plazo fijo</option>
                    <option value="seasonal">Temporada</option>
                    <option value="internship">Pasantía</option>
                  </select>
                </div>
              </div>
            </div>

            {/* TAB 1 - Documentos */}
            <div className={activeTab === 1 ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Documentos del Empleado
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { id: "empInputFoto", icon: "📷", label: "Foto del Empleado" },
                  { id: "empInputId", icon: "🪪", label: "ID / Identificación" },
                  { id: "empInputSs", icon: "📋", label: "Número de Seguro Social" },
                  { id: "empInputRec1", icon: "📄", label: "Carta de Recomendación 1" },
                  { id: "empInputRec2", icon: "📄", label: "Carta de Recomendación 2" },
                  { id: "empInputOther", icon: "🖇️", label: "Otro Documento" },
                ].map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => document.getElementById(doc.id)?.click()}
                    className="group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#e8e8e8] p-8 transition-all hover:border-brand hover:bg-[#fffcfc]"
                  >
                    <input type="file" id={doc.id} accept="image/*,.pdf" className="hidden" />
                    <span className="mb-3 text-4xl transition-transform group-hover:scale-110">{doc.icon}</span>
                    <span className="text-center text-[13px] font-bold text-[#666]">{doc.label}</span>
                    <div className="absolute right-3 top-3 hidden h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[12px] text-white">
                      ✓
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TAB 2 - Contrato & Salario */}
            <div className={activeTab === 2 ? "block" : "hidden"}>
              <h3 className="mb-4 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Información Salarial
              </h3>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Salario Base</label>
                  <input
                    name="salary_amount"
                    type="number"
                    step="0.01"
                    defaultValue={(initialEmployee as any)?.salary_amount ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Tipo / Frecuencia</label>
                  <select
                    name="payment_frequency"
                    defaultValue={(initialEmployee as any)?.payment_frequency ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                  >
                    <option value="">— Selecciona —</option>
                    <option value="hora">Por hora</option>
                    <option value="semana">Semanal</option>
                    <option value="quincena">Quincenal</option>
                    <option value="mes">Mensual</option>
                  </select>
                </div>
              </div>

              <h3 className="mb-4 mt-8 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Firma del Empleado
              </h3>
              <div className="overflow-hidden rounded-2xl border-[1.5px] border-[#e8e8e8] bg-white">
                <canvas className="h-[140px] w-full bg-[#fafafa] cursor-crosshair"></canvas>
                <div className="flex items-center justify-between border-t border-[#f0f0f0] bg-white p-3 px-4">
                  <button
                    type="button"
                    className="text-[11px] font-bold text-[#c0392b] hover:underline"
                  >
                    Limpiar Firma
                  </button>
                  <span className="text-[10px] font-bold text-[#999] uppercase tracking-wider">Esperando firma</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Nombre del Firmante</label>
                  <input
                    name="contract_signer_name"
                    defaultValue={initialEmployee?.contract_signer_name ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-[#444]">Fecha de Firma</label>
                  <input
                    name="contract_signed_at"
                    type="date"
                    defaultValue={initialEmployee?.contract_signed_at ?? ""}
                    className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* TAB 3 - Cuenta App */}
            <div className={activeTab === 3 ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[#f0f0f0] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#999]">
                Crear cuenta de acceso
              </h3>

              <div className="mb-6 flex items-center gap-4 rounded-2xl border-[1.5px] border-[#e8e8e8] bg-white p-6 shadow-sm">
                <button
                  type="button"
                  onClick={() => setCreateAccount((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    createAccount ? "bg-[#111]" : "bg-[#d1d1d1]"
                  }`}
                  role="switch"
                  aria-checked={createAccount}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      createAccount ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[#111]">
                    Habilitar acceso al Dashboard para este empleado
                  </span>
                  <span className="text-[12px] text-[#888]">
                    El empleado podrá iniciar sesión con las credenciales indicadas.
                  </span>
                </div>
              </div>

              {createAccount && (
                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2 duration-300 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-[#444]">Email de acceso</label>
                    <input
                      name="account_email"
                      type="email"
                      required={createAccount}
                      placeholder="usuario@empresa.com"
                      className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-[#444]">Contraseña inicial</label>
                    <input
                      name="account_password"
                      type="password"
                      required={createAccount}
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-[#444]">Rol del usuario</label>
                    <select
                      name="account_role"
                      defaultValue="employee"
                      className="w-full rounded-xl border-[1.5px] border-[#e8e8e8] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-brand appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat' }}
                    >
                      <option value="employee">Empleado</option>
                      <option value="company_admin">Administrador</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-[#f0f0f0] bg-white p-6 px-8">
            <Link
              href="/app/employees"
              className="rounded-full px-6 py-2.5 text-sm font-bold text-[#888] transition-colors hover:bg-gray-100"
            >
              Cancelar
            </Link>
            <SubmitButton
              label={mode === "edit" ? "Actualizar Empleado" : "Guardar Empleado"}
              pendingLabel={mode === "edit" ? "Actualizando..." : "Guardando..."}
              pending={isActionPending || saving}
              className="rounded-full bg-[#111] px-10 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
