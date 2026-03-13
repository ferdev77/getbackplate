"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ModalBranch = { id: string; name: string };
type ModalDocument = { id: string; title: string; created_at: string };
type ModalDepartment = { id: string; name: string };
type ModalPosition = { id: string; department_id: string; name: string; is_active: boolean };

type NewEmployeeModalProps = {
  open: boolean;
  branches: ModalBranch[];
  documents: ModalDocument[];
  departments: ModalDepartment[];
  positions: ModalPosition[];
  mode?: "create" | "edit";
  initialEmployee?: {
    id: string;
    first_name: string;
    last_name: string;
    birth_date: string | null;
    sex: string | null;
    nationality: string | null;
    phone_country_code: string | null;
    phone: string | null;
    email: string | null;
    address_line1: string | null;
    address_city: string | null;
    address_state: string | null;
    address_postal_code: string | null;
    address_country: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contact_email: string | null;
    branch_id: string | null;
    position: string | null;
    position_id?: string | null;
    department_id: string | null;
    status: string;
    hired_at: string | null;
    contract_type: string | null;
    contract_status: string | null;
    contract_start_date: string | null;
    contract_end_date: string | null;
    contract_notes: string | null;
    contract_signer_name: string | null;
    contract_signed_at: string | null;
    salary_amount: number | null;
    payment_frequency: string | null;
    salary_currency: string | null;
    linked_document_ids: string[];
  };
};

const TABS = [
  { id: "personal", label: "Info Personal" },
  { id: "documents", label: "Documentos" },
  { id: "contract", label: "Contrato" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DOCUMENT_SLOTS = [
  { key: "photo", icon: "📷", label: "Foto del Empleado", accept: "image/*" },
  { key: "id", icon: "🪪", label: "ID / Identificacion", accept: ".pdf,image/*" },
  { key: "ssn", icon: "📋", label: "Numero de Seguro Social", accept: ".pdf,image/*" },
  { key: "rec1", icon: "📄", label: "Carta de Recomendacion 1", accept: ".pdf,image/*" },
  { key: "rec2", icon: "📄", label: "Carta de Recomendacion 2", accept: ".pdf,image/*" },
  { key: "other", icon: "📎", label: "Otro Documento", accept: ".pdf,image/*" },
] as const;

export function NewEmployeeModal({ open, branches, documents, departments, positions, mode = "create", initialEmployee }: NewEmployeeModalProps) {
  const [tab, setTab] = useState<TabId>("personal");
  const [saving, setSaving] = useState(false);
  const [slotFileNames, setSlotFileNames] = useState<Record<string, string>>({});
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(initialEmployee?.department_id ?? "");
  const [selectedPositionId, setSelectedPositionId] = useState(initialEmployee?.position_id ?? "");

  const availablePositions = useMemo(
    () => positions.filter((position) => position.department_id === selectedDepartmentId),
    [positions, selectedDepartmentId],
  );

  useEffect(() => {
    if (!open) return;
    setTab("personal");
    setSelectedDepartmentId(initialEmployee?.department_id ?? "");
    setSelectedPositionId(initialEmployee?.position_id ?? "");
    setSlotFileNames({});
  }, [open, initialEmployee]);

  if (!open) return null;

  function onSlotFileChange(slotKey: string, event: React.ChangeEvent<HTMLInputElement>) {
    const fileName = event.target.files?.[0]?.name ?? "";
    setSlotFileNames((prev) => ({ ...prev, [slotKey]: fileName }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/company/employees", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        window.location.href = `/app/employees?status=error&message=${encodeURIComponent(data.error || "No se pudo guardar")}`;
        return;
      }
      window.location.href =
        "/app/employees?status=success&message=" +
        encodeURIComponent(mode === "edit" ? "Empleado actualizado correctamente" : "Empleado guardado correctamente");
    } catch {
      window.location.href = "/app/employees?status=error&message=" + encodeURIComponent("Error inesperado guardando empleado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex shrink-0 items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 pb-4 pt-5">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border-[1.5px] border-[#f0d5d0] bg-[#fff5f3]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <p className="font-serif text-[15px] font-bold text-[#111]">{mode === "edit" ? "Editar Empleado" : "Nuevo Empleado"}</p>
          </div>
          <Link href="/app/employees" className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-[20px] text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {mode === "edit" && initialEmployee ? <input type="hidden" name="employee_id" value={initialEmployee.id} /> : null}
          <input type="hidden" name="position_id" value={selectedPositionId} />
          <div className="flex shrink-0 border-b-[1.5px] border-[#f0f0f0] px-6">
            <div className="flex">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`-mb-px border-b-[2.5px] px-4 py-3 text-[13px] font-semibold ${tab === item.id ? "border-[#c0392b] text-[#c0392b]" : "border-transparent text-[#aaa]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className={`${tab === "personal" ? "block" : "hidden"} px-6 py-5`}>
              <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Informacion personal</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre(s)</span>
                  <input name="first_name" required defaultValue={initialEmployee?.first_name ?? ""} placeholder="Juan" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Apellidos</span>
                  <input name="last_name" required defaultValue={initialEmployee?.last_name ?? ""} placeholder="Garcia Lopez" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha nacimiento</span>
                  <input name="birth_date" type="date" defaultValue={initialEmployee?.birth_date ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Sexo</span>
                  <select name="sex" defaultValue={initialEmployee?.sex ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="">-</option><option value="male">Masculino</option><option value="female">Femenino</option><option value="other">Otro</option></select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nacionalidad</span>
                  <input name="nationality" defaultValue={initialEmployee?.nationality ?? ""} placeholder="Mexicana" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Telefono</span>
                  <div className="flex gap-1.5">
                    <input name="phone_country_code" defaultValue={initialEmployee?.phone_country_code ?? ""} placeholder="+52" className="w-[92px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-2 py-2 text-[13px] text-[#111]" />
                    <input name="phone" defaultValue={initialEmployee?.phone ?? ""} placeholder="228 555 0000" className="min-w-0 flex-1 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                  </div>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email</span>
                  <input name="email" type="email" defaultValue={initialEmployee?.email ?? ""} placeholder="juan@email.com" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>

              <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Direccion</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Calle y numero</span>
                  <input name="address_line1" defaultValue={initialEmployee?.address_line1 ?? ""} placeholder="412 Oak Street" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Ciudad</span>
                  <input name="address_city" defaultValue={initialEmployee?.address_city ?? ""} placeholder="Long Beach" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Estado</span>
                  <input name="address_state" defaultValue={initialEmployee?.address_state ?? ""} placeholder="MS" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Zip code</span>
                  <input name="address_postal_code" defaultValue={initialEmployee?.address_postal_code ?? ""} placeholder="39560" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Pais</span>
                  <input name="address_country" defaultValue={initialEmployee?.address_country ?? ""} placeholder="Estados Unidos" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>

              <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Contacto de emergencia</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre</span>
                  <input name="emergency_contact_name" defaultValue={initialEmployee?.emergency_contact_name ?? ""} placeholder="Nombre · Parentesco" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Telefono</span>
                  <input name="emergency_contact_phone" defaultValue={initialEmployee?.emergency_contact_phone ?? ""} placeholder="+1 228 555 0000" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email</span>
                  <input name="emergency_contact_email" defaultValue={initialEmployee?.emergency_contact_email ?? ""} placeholder="emergencia@email.com" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>

              <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Informacion laboral</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Locacion</span>
                  <select name="branch_id" defaultValue={initialEmployee?.branch_id ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="">- Selecciona locacion -</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                </label>
                <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] px-3 py-2 text-xs text-[#7b726d]">El puesto se define por departamento y se guarda en el historial del empleado.</div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Departamento</span>
                  <select name="department_id" value={selectedDepartmentId} onChange={(event) => { const nextDepartment = event.target.value; setSelectedDepartmentId(nextDepartment); if (!positions.some((position) => position.department_id === nextDepartment && position.id === selectedPositionId)) { setSelectedPositionId(""); } }} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="">- Selecciona departamento -</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Puesto</span>
                  <select value={selectedPositionId} onChange={(event) => setSelectedPositionId(event.target.value)} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="">- Selecciona puesto -</option>{availablePositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Estado</span>
                  <select name="employment_status" defaultValue={initialEmployee?.status ?? "active"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="vacation">Vacaciones</option><option value="leave">Baja</option></select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha de ingreso</span>
                  <input name="hired_at" type="date" defaultValue={initialEmployee?.hired_at ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Acceso de usuario</span>
                  <select name="create_mode" defaultValue="without_account" disabled={mode === "edit"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111] disabled:opacity-60"><option value="without_account">Sin cuenta</option><option value="with_account">Con cuenta</option></select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email de acceso</span>
                  <input name="account_email" type="email" placeholder="nombre@empresa.com" disabled={mode === "edit"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111] disabled:opacity-60" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Contrasena de acceso</span>
                  <input name="account_password" type="password" placeholder="Minimo 8 caracteres" disabled={mode === "edit"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111] disabled:opacity-60" />
                </label>
              </div>

              <h3 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Salario</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Salario actual</span>
                  <input name="salary_amount" type="number" step="0.01" defaultValue={initialEmployee?.salary_amount ?? ""} placeholder="0.00" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Tipo</span>
                  <select name="payment_frequency" defaultValue={initialEmployee?.payment_frequency ?? "hora"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="hora">Por hora</option><option value="semana">Semanal</option><option value="quincena">Quincenal</option><option value="mes">Mensual</option></select>
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Moneda</span>
                  <input name="salary_currency" placeholder="USD" defaultValue={initialEmployee?.salary_currency ?? "USD"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
            </section>

            <section className={`${tab === "documents" ? "block" : "hidden"} px-6 py-5`}>
              <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Documentos del empleado</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {DOCUMENT_SLOTS.map((slot) => (
                  <label key={slot.key} htmlFor={`employee-doc-${slot.key}`} className="group cursor-pointer rounded-xl border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] p-3 transition hover:border-[#d8d8d8] hover:bg-[#f5f5f5]">
                    <input id={`employee-doc-${slot.key}`} name={`document_file_${slot.key}`} type="file" accept={slot.accept} className="hidden" onChange={(event) => onSlotFileChange(slot.key, event)} />
                    <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-base">{slot.icon}</div>
                    <p className="text-[12px] font-semibold text-[#222]">{slot.label}</p>
                    <p className="mt-1 min-h-4 truncate text-[11px] text-[#888]">{slotFileNames[slot.key] || "Haz clic para cargar"}</p>
                    <div className="mt-2 text-right text-[12px] font-bold text-[#2f8b4f]">{slotFileNames[slot.key] ? "✓" : ""}</div>
                  </label>
                ))}
              </div>
              {documents.length ? (
                <>
                  <p className="mt-3 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Vincular documentos ya existentes (opcional)</p>
                  <div className="mt-2 grid gap-2">
                    {documents.map((doc) => (
                      <label key={doc.id} className="inline-flex cursor-pointer items-center justify-between rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 py-2 text-[12px] text-[#333] hover:bg-[#f9f9f9]">
                        <span className="truncate pr-3">{doc.title}</span>
                          <span className="inline-flex items-center gap-2 text-[#777]"><input type="checkbox" name="employee_document_id" value={doc.id} defaultChecked={Boolean(initialEmployee?.linked_document_ids.includes(doc.id))} className="h-4 w-4 accent-[#c0392b]" /> {new Date(doc.created_at).toLocaleDateString("es-AR")}</span>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-[#888]">No hay documentos previos en empresa. Puedes cargar desde los slots de arriba.</p>
              )}
            </section>

            <section className={`${tab === "contract" ? "block" : "hidden"} px-6 py-5`}>
              <h3 className="mb-3 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Vista previa del contrato</h3>
              <div className="rounded-xl border border-dashed border-[#dfdfdf] bg-[#fafafa] p-3 text-[13px] leading-relaxed text-[#7f7f7f]">
                Completa la informacion del empleado para generar el contrato.<br />
                Salario acordado: <span className="font-semibold text-[#444]">$0.00</span>.
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Tipo contrato</span>
                  <input name="contract_type" defaultValue={initialEmployee?.contract_type ?? ""} placeholder="Tiempo completo" className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Estado</span>
                  <select name="contract_status" defaultValue={initialEmployee?.contract_status ?? "draft"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]"><option value="draft">Borrador</option><option value="active">Activo</option><option value="ended">Finalizado</option><option value="cancelled">Cancelado</option></select>
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha inicio</span>
                  <input name="contract_start_date" type="date" defaultValue={initialEmployee?.contract_start_date ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Fecha fin</span>
                  <input name="contract_end_date" type="date" defaultValue={initialEmployee?.contract_end_date ?? ""} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
                </label>
              </div>
              <label className="mt-3 grid gap-1.5">
                <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Notas internas</span>
                <textarea name="contract_notes" rows={3} defaultValue={initialEmployee?.contract_notes ?? ""} placeholder="Notas del contrato..." className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-[13px] text-[#111]" />
              </label>

              <h4 className="mb-3 mt-6 border-b-[1.5px] border-[#f0f0f0] pb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Firma del empleado</h4>
              <div className="rounded-xl border-[1.5px] border-[#e8e8e8] bg-white p-3">
                <div className="grid h-[140px] place-items-center rounded-lg border border-dashed border-[#dcdcdc] bg-[#fbfbfb] text-[12px] text-[#9a9a9a]">Area de firma (proxima iteracion digital)</div>
                <div className="mt-2 flex items-center justify-between">
                  <button type="button" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-3 py-1.5 text-[12px] font-semibold text-[#666]">Limpiar Firma</button>
                  <span className="text-[12px] text-[#999]">Sin firma</span>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre del firmante</span>
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
            <button type="submit" disabled={saving} className="rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? (mode === "edit" ? "Actualizando..." : "Guardando...") : (mode === "edit" ? "Actualizar Empleado" : "Guardar Empleado")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
