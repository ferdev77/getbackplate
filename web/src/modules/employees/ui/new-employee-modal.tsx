"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, startTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/shared/ui/submit-button";

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
    organization_user_profile_id?: string;
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
    salary_amount?: number | null;
    payment_frequency?: string | null;
    has_dashboard_access?: boolean;
    documents_by_slot?: Record<string, { documentId: string; title: string; status: string }>;
  };
  recentDocuments?: ModalDocument[];
};

const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[var(--gbp-border)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[var(--gbp-text)]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[var(--gbp-text2)]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const FIELD_LABEL = "text-[12px] font-bold text-[var(--gbp-text2)]";
const FIELD_INPUT = "w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-3 text-sm text-[var(--gbp-text)] outline-none transition-all focus:border-[var(--gbp-accent)]";

export function NewEmployeeModal({
  open,
  branches,
  departments,
  positions,
  mode = "create",
  initialEmployee,
}: NewEmployeeModalProps) {
  const [isActionPending, setIsActionPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [selectedDept, setSelectedDept] = useState(initialEmployee?.department_id ?? "");
  const [createAccount, setCreateAccount] = useState(Boolean(initialEmployee?.has_dashboard_access));
  const [isEmployeeProfile, setIsEmployeeProfile] = useState(
    initialEmployee?.organization_user_profile_id ? false : mode === "edit",
  );
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!initialEmployee?.documents_by_slot) {
      setSelectedDocumentFiles({});
      return;
    }

    const byName: Record<string, string> = {};
    const rules: Array<{ slot: string; inputName: string }> = [
      { slot: "photo", inputName: "document_file_photo" },
      { slot: "id", inputName: "document_file_id" },
      { slot: "ssn", inputName: "document_file_ssn" },
      { slot: "rec1", inputName: "document_file_rec1" },
      { slot: "rec2", inputName: "document_file_rec2" },
      { slot: "other", inputName: "document_file_other" },
    ];

    for (const rule of rules) {
      const row = initialEmployee.documents_by_slot?.[rule.slot];
      if (!row?.title) continue;
      byName[rule.inputName] = row.title;
    }

    setSelectedDocumentFiles(byName);
  }, [initialEmployee?.documents_by_slot]);

  async function handleResendInvitation() {
    const targetEmail = initialEmployee?.email;
    if (!targetEmail) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/company/invitations/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          fullName: `${initialEmployee?.first_name ?? ""} ${initialEmployee?.last_name ?? ""}`.trim(),
          roleCode: "employee",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallback = "No se pudo reenviar la invitación";
        const baseMessage = typeof data.error === "string" ? data.error : fallback;
        const message =
          res.status === 404
            ? `${baseMessage} Si no tiene cuenta creada, primero crea el acceso desde la pestaña Cuenta (App).`
            : baseMessage;
        throw new Error(message);
      }
      toast.success(data.message || `Invitación reenviada a ${targetEmail}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al reenviar invitación");
    } finally {
      setIsResending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsActionPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/company/employees", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el registro");
      }

      toast.success(data.message || (mode === "edit" ? "Registro actualizado correctamente" : "Registro creado correctamente"));
      startTransition(() => {
        router.refresh();
        router.push("/app/employees");
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el registro");
    } finally {
      setIsActionPending(false);
    }
  }

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => p.department_id === selectedDept && p.is_active);
  }, [positions, selectedDept]);

  const tabs = useMemo(
    () => [
      { key: "personal", label: "Info Personal" },
      { key: "documents", label: "Documentos" },
      ...(isEmployeeProfile ? [{ key: "contract", label: "Contrato" }] : []),
      { key: "account", label: "Cuenta (App)" },
    ],
    [isEmployeeProfile],
  );

  const currentTabIndex = activeTab <= tabs.length - 1 ? activeTab : 0;
  const requiresAccountPassword = createAccount && !(mode === "edit" && initialEmployee?.has_dashboard_access);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`relative flex h-full max-h-[90vh] w-full max-w-[850px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl ${DARK_PANEL}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--gbp-border)] p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--gbp-accent)]" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <h2 className={`text-xl font-bold tracking-tight text-[var(--gbp-text)] ${DARK_TEXT}`} style={{ fontFamily: 'Georgia, serif' }}>
              {mode === "edit" ? "Editar Usuario / Empleado" : "Nuevo Usuario / Empleado"}
            </h2>
          </div>
          <Link href="/app/employees" className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)] ${DARK_GHOST}`}>
            <span className="text-xl">✕</span>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-6">
          {tabs.map((tab, idx) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`border-b-2 px-4 py-4 text-sm font-semibold transition-all ${
                currentTabIndex === idx
                  ? "border-brand text-brand"
                  : `border-transparent text-[var(--gbp-text2)] hover:text-[var(--gbp-text)] ${DARK_MUTED}`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mode === "edit" && initialEmployee ? (
            <input type="hidden" name="employee_id" value={initialEmployee.id} />
          ) : null}
          {initialEmployee?.organization_user_profile_id ? (
            <input type="hidden" name="organization_user_profile_id" value={initialEmployee.organization_user_profile_id} />
          ) : null}
          <input type="hidden" name="create_mode" value={createAccount ? "with_account" : "without_account"} />
          <input type="hidden" name="is_employee" value={isEmployeeProfile ? "yes" : "no"} />
          <input type="hidden" name="existing_dashboard_access" value={initialEmployee?.has_dashboard_access ? "yes" : "no"} />

          <div className="flex-1 overflow-y-auto bg-[var(--gbp-surface)] p-8">
            {/* TAB 0 - Info Personal */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "personal") ? "block" : "hidden"}>
              <h3 className={`mb-4 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)] ${DARK_MUTED}`}>
                Información Personal
              </h3>
              <div className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === "edit") return;
                      setIsEmployeeProfile((prev) => {
                        return !prev;
                      });
                    }}
                    disabled={mode === "edit"}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                      isEmployeeProfile ? "bg-[var(--gbp-text)]" : "bg-[var(--gbp-muted)]"
                    } ${mode === "edit" ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                    role="switch"
                    aria-checked={isEmployeeProfile}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                        isEmployeeProfile ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-sm font-bold text-[var(--gbp-text)]">Es empleado?</p>
                    <p className="text-[12px] text-[var(--gbp-text2)]">
                      {isEmployeeProfile
                        ? "Se guardara perfil laboral y aparecera en la grilla de empleados."
                        : "Se creara solo usuario de la app (sin perfil laboral)."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Nombre(s) *</label>
                  <input
                    name="first_name"
                    required
                    defaultValue={initialEmployee?.first_name ?? ""}
                    className={FIELD_INPUT}
                    placeholder="Juan"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Apellidos *</label>
                  <input
                    name="last_name"
                    required
                    defaultValue={initialEmployee?.last_name ?? ""}
                    className={FIELD_INPUT}
                    placeholder="García López"
                  />
                </div>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Teléfono *</label>
                  <input
                    name="phone"
                    required
                    defaultValue={initialEmployee?.phone ?? ""}
                    className={FIELD_INPUT}
                    placeholder="+1 228 555 0000"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Email *</label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={initialEmployee?.email ?? ""}
                    className={FIELD_INPUT}
                    placeholder="usuario@empresa.com"
                  />
                </div>
              </div>

              {isEmployeeProfile ? (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Fecha Nacimiento</label>
                      <input
                        name="birth_date"
                        type="date"
                        defaultValue={initialEmployee?.birth_date ?? ""}
                        className={FIELD_INPUT}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Tipo de Documento</label>
                      <select
                        name="document_type"
                        defaultValue={initialEmployee?.document_type ?? ""}
                        className={`${FIELD_INPUT} appearance-none`}
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
                      <label className={FIELD_LABEL}>Número de Documento</label>
                      <input
                        name="document_number"
                        defaultValue={initialEmployee?.document_number ?? ""}
                        className={FIELD_INPUT}
                        placeholder="00.000.000"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>Dirección Completa</label>
                      <input
                        name="address"
                        defaultValue={initialEmployee?.address ?? ""}
                        className={FIELD_INPUT}
                        placeholder="Calle, Número, Ciudad, Estado, País"
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <h3 className="mb-4 mt-8 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Información Laboral
              </h3>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Locación / Sucursal</label>
                  <select
                    name="branch_id"
                    defaultValue={initialEmployee?.branch_id ?? ""}
                    className={`${FIELD_INPUT} appearance-none`}
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
                  <label className={FIELD_LABEL}>Departamento</label>
                  <select
                    name="department_id"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className={`${FIELD_INPUT} appearance-none`}
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
                  <label className={FIELD_LABEL}>Puesto</label>
                  <select
                    name="position_id"
                    defaultValue={initialEmployee?.position_id ?? ""}
                    className={`${FIELD_INPUT} appearance-none`}
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

            </div>

            {/* TAB 1 - Documentos */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "documents") ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Documentos del Empleado
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { id: "empInputFoto", slot: "photo", name: "document_file_photo", icon: "📷", label: "Foto del Empleado" },
                  { id: "empInputId", slot: "id", name: "document_file_id", icon: "🪪", label: "ID / Identificación" },
                  { id: "empInputSs", slot: "ssn", name: "document_file_ssn", icon: "📋", label: "Número de Seguro Social" },
                  { id: "empInputRec1", slot: "rec1", name: "document_file_rec1", icon: "📄", label: "Carta de Recomendación 1" },
                  { id: "empInputRec2", slot: "rec2", name: "document_file_rec2", icon: "📄", label: "Carta de Recomendación 2" },
                  { id: "empInputOther", slot: "other", name: "document_file_other", icon: "🖇️", label: "Otro Documento" },
                ].map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => document.getElementById(doc.id)?.click()}
                    className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-bg)] ${selectedDocumentFiles[doc.name] ? "border-[var(--gbp-success)] bg-[var(--gbp-success-soft)]" : "border-[var(--gbp-border2)]"}`}
                  >
                    <input
                      type="file"
                      id={doc.id}
                      name={doc.name}
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(event) => {
                        const fileName = event.target.files?.[0]?.name ?? "";
                        setSelectedDocumentFiles((prev) => ({
                          ...prev,
                          [doc.name]: fileName,
                        }));
                      }}
                    />
                    <span className="mb-3 text-4xl transition-transform group-hover:scale-110">{doc.icon}</span>
                    <span className="text-center text-[13px] font-bold text-[var(--gbp-text2)]">{doc.label}</span>
                    {initialEmployee?.documents_by_slot?.[doc.slot] ? (
                      <div className="mt-2 flex items-center gap-2">
                        <a
                          href={`/api/documents/${initialEmployee.documents_by_slot[doc.slot].documentId}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                        >
                          Ver
                        </a>
                        <a
                          href={`/api/documents/${initialEmployee.documents_by_slot[doc.slot].documentId}/download`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-success)] hover:bg-[var(--gbp-success-soft)]"
                        >
                          Descargar
                        </a>
                      </div>
                    ) : null}
                    {selectedDocumentFiles[doc.name] ? (
                      <>
                        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[12px] text-white">
                          ✓
                        </div>
                        <p className="mt-2 line-clamp-1 max-w-[220px] text-center text-[11px] font-semibold text-[var(--gbp-success)]">
                          {selectedDocumentFiles[doc.name]}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-[var(--gbp-muted)]">Haz clic para adjuntar</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* TAB 2 - Contrato (solo empleado) */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "contract") ? "block" : "hidden"}>
              <h3 className="mb-4 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Contrato y Salario
              </h3>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Fecha de Ingreso</label>
                  <input
                    name="hire_date"
                    type="date"
                    defaultValue={initialEmployee?.hire_date ?? ""}
                    className={FIELD_INPUT}
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Tipo Contrato</label>
                  <select
                    name="contract_type"
                    defaultValue={initialEmployee?.contract_type ?? "indefinite"}
                    className={`${FIELD_INPUT} appearance-none`}
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

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Salario Base</label>
                  <input
                    name="salary_amount"
                    type="number"
                    step="0.01"
                    defaultValue={initialEmployee?.salary_amount ?? ""}
                    className={FIELD_INPUT}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Frecuencia de pago</label>
                  <select
                    name="payment_frequency"
                    defaultValue={initialEmployee?.payment_frequency ?? ""}
                    className={`${FIELD_INPUT} appearance-none`}
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

              <h4 className="mb-3 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Vista previa del contrato
              </h4>
              <article className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 text-[13px] leading-6 text-[var(--gbp-text2)]">
                <p className="mb-3">
                  El presente contrato se celebra entre <span className="font-semibold text-[var(--gbp-text)]">[Nombre del empleado]</span> y la empresa,
                  para desempenar funciones en el puesto asignado con cumplimiento de las politicas internas.
                </p>
                <p>
                  <span className="font-semibold text-[var(--gbp-text)]">Fecha de ingreso:</span> [Fecha de ingreso]
                  <span className="mx-2 text-[var(--gbp-muted)]">|</span>
                  <span className="font-semibold text-[var(--gbp-text)]">Tipo de contrato:</span> [Tipo de contrato]
                </p>
                <p>
                  <span className="font-semibold text-[var(--gbp-text)]">Salario base:</span> [Salario]
                  <span className="mx-2 text-[var(--gbp-muted)]">|</span>
                  <span className="font-semibold text-[var(--gbp-text)]">Frecuencia:</span> [Frecuencia de pago]
                </p>
              </article>

              <h4 className="mb-3 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Firma del empleado
              </h4>
              <div className="mb-6 overflow-hidden rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                <canvas className="h-[140px] w-full cursor-crosshair bg-[var(--gbp-bg)]" />
                <div className="flex items-center justify-between border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3 px-4">
                  <button type="button" className="text-[11px] font-bold text-[var(--gbp-accent)] hover:underline">
                    Limpiar firma
                  </button>
                  <span className="text-[10px] font-bold tracking-wider text-[var(--gbp-muted)] uppercase">Esperando firma</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Nombre del Firmante</label>
                  <input
                    name="contract_signer_name"
                    defaultValue={initialEmployee?.contract_signer_name ?? ""}
                    className={FIELD_INPUT}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Fecha de Firma</label>
                  <input
                    name="contract_signed_at"
                    type="date"
                    defaultValue={initialEmployee?.contract_signed_at ?? ""}
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
            </div>

            {/* TAB Cuenta App */}
            <div className={currentTabIndex === tabs.findIndex((tab) => tab.key === "account") ? "block" : "hidden"}>
              <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
                Crear cuenta de acceso
              </h3>

              <div className="mb-6 flex items-center gap-4 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCreateAccount((prev) => !prev);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    createAccount ? "bg-[var(--gbp-text)]" : "bg-[var(--gbp-muted)]"
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
                  <span className="text-sm font-bold text-[var(--gbp-text)]">
                    Habilitar acceso al Dashboard
                  </span>
                  <span className="text-[12px] text-[var(--gbp-text2)]">
                    {isEmployeeProfile
                      ? "Opcional: habilita acceso para que pueda iniciar sesión en la app."
                      : "Opcional: habilita acceso para crear tambien sus credenciales de ingreso."}
                  </span>
                </div>
              </div>

              {createAccount && (
                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-top-2 duration-300 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className={FIELD_LABEL}>Email de acceso</label>
                    <input
                      name="account_email"
                      type="email"
                      required={createAccount}
                      defaultValue={initialEmployee?.email ?? ""}
                      placeholder="usuario@empresa.com"
                      className={FIELD_INPUT}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className={FIELD_LABEL}>Contraseña inicial</label>
                    <input
                      name="account_password"
                      type="password"
                      required={requiresAccountPassword}
                      minLength={8}
                      placeholder={mode === "edit" && initialEmployee?.has_dashboard_access ? "Opcional: dejar vacio para mantener" : "Mínimo 8 caracteres"}
                      className={FIELD_INPUT}
                    />
                  </div>
                </div>
              )}

              {createAccount ? (
                <p className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs text-[var(--gbp-text2)]">
                  Esta cuenta se crea como <span className="font-semibold text-[var(--gbp-text)]">Usuario/Empleado</span>. Los administradores se crean desde la pantalla de <span className="font-semibold text-[var(--gbp-text)]">Administradores</span>.
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
           <div className="flex items-center justify-between gap-3 border-t border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 px-8">
            <div>
              {mode === "edit" && initialEmployee?.email ? (
                <button
                  type="button"
                  onClick={() => void handleResendInvitation()}
                  disabled={isResending}
                  className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent-glow)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                >
                  {isResending ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                  )}
                  {isResending ? "Enviando..." : "Reenviar Invitación"}
                </button>
              ) : <span />}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/app/employees"
                className={`rounded-full px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-bg)] ${DARK_GHOST}`}
              >
                Cancelar
              </Link>
              <SubmitButton
                label={mode === "edit" ? "Actualizar Usuario / Empleado" : "Guardar Usuario / Empleado"}
                pendingLabel={mode === "edit" ? "Actualizando..." : "Guardando..."}
                pending={isActionPending}
                className="rounded-full bg-[var(--gbp-accent)] px-10 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-[var(--gbp-accent-hover)] active:scale-[0.98]"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
