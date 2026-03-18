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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="emp-modal h-full max-h-[90vh]">
        <div className="emp-modal-header">
          <div className="emp-modal-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "30px", height: "30px", background: "#fff5f3", border: "1.5px solid #f0d5d0", borderRadius: "8px", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <span>{mode === "edit" ? "Editar Empleado" : "Nuevo Empleado"}</span>
          </div>
          <Link href="/app/employees" className="emp-modal-close" style={{ textDecoration: 'none' }}>✕</Link>
        </div>

        <div className="emp-tabs">
          <div className={`emp-tab ${activeTab === 0 ? "active" : ""}`} onClick={() => setActiveTab(0)}>Info Personal</div>
          <div className={`emp-tab ${activeTab === 1 ? "active" : ""}`} onClick={() => setActiveTab(1)}>Documentos</div>
          <div className={`emp-tab ${activeTab === 2 ? "active" : ""}`} onClick={() => setActiveTab(2)}>Contrato & Salario</div>
          <div className={`emp-tab ${activeTab === 3 ? "active" : ""}`} onClick={() => setActiveTab(3)}>Cuenta (App)</div>
        </div>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mode === "edit" && initialEmployee ? <input type="hidden" name="employee_id" value={initialEmployee.id} /> : null}
          <input type="hidden" name="create_mode" value={createAccount ? "with_account" : "without_account"} />

          <div className="emp-modal-body p-6">
            
            {/* TAB 0 - Info Personal */}
            <div style={{ display: activeTab === 0 ? 'block' : 'none' }}>
              <div className="emp-section-divider">Información Personal</div>
              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Nombre(s) *</label>
                  <input name="first_name" required defaultValue={initialEmployee?.first_name ?? ""} className="emp-field-input" placeholder="Juan" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Apellidos</label>
                  <input name="last_name" defaultValue={initialEmployee?.last_name ?? ""} className="emp-field-input" placeholder="García López" />
                </div>
              </div>

              <div className="emp-form-row three">
                <div className="emp-form-group">
                  <label className="emp-form-label">Fecha Nacimiento</label>
                  <input name="birth_date" type="date" defaultValue={initialEmployee?.birth_date ?? ""} className="emp-field-input" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Tipo de Documento</label>
                  <select name="document_id" defaultValue={initialEmployee?.document_type ?? ""} className="emp-field-select">
                    <option value="">—</option>
                    <option value="dni">DNI</option>
                    <option value="cuil">CUIL / CUIT</option>
                    <option value="ssn">SSN / ITIN</option>
                    <option value="passport">Pasaporte</option>
                  </select>
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Número de Documento</label>
                  <input name="document_number" defaultValue={initialEmployee?.document_number ?? ""} className="emp-field-input" placeholder="00.000.000" />
                </div>
              </div>

              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Teléfono</label>
                  <input name="phone" defaultValue={initialEmployee?.phone ?? ""} className="emp-field-input" placeholder="+1 228 555 0000" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Email Personal</label>
                  <input name="personal_email" type="email" defaultValue={initialEmployee?.personal_email ?? ""} className="emp-field-input" placeholder="juan@email.com" />
                </div>
              </div>

              <div className="emp-section-divider">Dirección</div>
              <div className="emp-form-row one">
                <div className="emp-form-group">
                  <label className="emp-form-label">Dirección Completa</label>
                  <input name="address" defaultValue={initialEmployee?.address ?? ""} className="emp-field-input" placeholder="Calle, Número, Ciudad, Estado, País" />
                </div>
              </div>

              <div className="emp-section-divider">Información Laboral</div>
              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Email Corporativo</label>
                  <input name="email" type="email" defaultValue={initialEmployee?.email ?? ""} className="emp-field-input" placeholder="p.ej@empresa.com" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Locación / Sucursal</label>
                  <select name="branch_id" defaultValue={initialEmployee?.branch_id ?? ""} className="emp-field-select">
                    <option value="">— Selecciona locación —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Departamento</label>
                  <select 
                    name="department_id" 
                    value={selectedDept} 
                    onChange={e => setSelectedDept(e.target.value)}
                    className="emp-field-select"
                  >
                    <option value="">— Selecciona departamento —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Puesto</label>
                  <select name="position_id" defaultValue={initialEmployee?.position_id ?? ""} className="emp-field-select">
                    <option value="">{selectedDept ? "— Selecciona un puesto —" : "Selecciona departamento primero"}</option>
                    {filteredPositions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Fecha de Ingreso</label>
                  <input name="hire_date" type="date" defaultValue={initialEmployee?.hire_date ?? ""} className="emp-field-input" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Tipo Contrato</label>
                  <select name="contract_type" defaultValue={initialEmployee?.contract_type ?? "indefinite"} className="emp-field-select">
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
            <div style={{ display: activeTab === 1 ? 'block' : 'none' }}>
              <div className="emp-section-divider">Documentos del Empleado</div>
              <div className="emp-doc-grid">
                <div className="emp-doc-slot" onClick={() => document.getElementById('empInputFoto')?.click()}>
                  <input type="file" id="empInputFoto" accept="image/*" style={{ display: 'none' }} />
                  <div className="emp-doc-icon">📷</div>
                  <div className="emp-doc-label">Foto del Empleado</div>
                  <div className="emp-doc-name"></div>
                  <div className="emp-doc-check">✓</div>
                </div>
                <div className="emp-doc-slot" onClick={() => document.getElementById('empInputId')?.click()}>
                  <input type="file" id="empInputId" accept=".pdf,image/*" style={{ display: 'none' }} />
                  <div className="emp-doc-icon">🪪</div>
                  <div className="emp-doc-label">ID / Identificación</div>
                  <div className="emp-doc-name"></div>
                  <div className="emp-doc-check">✓</div>
                </div>
                <div className="emp-doc-slot" onClick={() => document.getElementById('empInputSs')?.click()}>
                  <input type="file" id="empInputSs" accept=".pdf,image/*" style={{ display: 'none' }} />
                  <div className="emp-doc-icon">📋</div>
                  <div className="emp-doc-label">Número de SS / CUIL</div>
                  <div className="emp-doc-name"></div>
                  <div className="emp-doc-check">✓</div>
                </div>
                <div className="emp-doc-slot" onClick={() => document.getElementById('empInputRec1')?.click()}>
                  <input type="file" id="empInputRec1" accept=".pdf,image/*" style={{ display: 'none' }} />
                  <div className="emp-doc-icon">📄</div>
                  <div className="emp-doc-label">CV o Currículum</div>
                  <div className="emp-doc-name"></div>
                  <div className="emp-doc-check">✓</div>
                </div>
              </div>
            </div>

            {/* TAB 2 - Contrato & Salario */}
            <div style={{ display: activeTab === 2 ? 'block' : 'none' }}>
              <div className="emp-section-divider">Información Salarial</div>
              <div className="emp-form-row">
                <div className="emp-form-group">
                  <label className="emp-form-label">Salario Base</label>
                  <input className="emp-field-input" type="number" placeholder="0.00" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Tipo</label>
                  <select className="emp-field-select">
                    <option value="hora">Por hora</option>
                    <option value="semana">Semanal</option>
                    <option value="quincena">Quincenal</option>
                    <option value="mes">Mensual</option>
                  </select>
                </div>
              </div>

              <div className="emp-section-divider">Firma del Empleado</div>
              <div className="emp-sig-area">
                <canvas className="emp-sig-canvas bg-neutral-900 w-full" style={{ height: '140px' }}></canvas>
                <div className="emp-sig-toolbar">
                  <button type="button" className="btn-secondary">Limpiar Firma</button>
                  <span className="emp-sig-status">Sin firma</span>
                </div>
              </div>
              <div className="emp-form-row" style={{ marginTop: '14px' }}>
                <div className="emp-form-group">
                  <label className="emp-form-label">Nombre del Firmante</label>
                  <input name="contract_signer_name" defaultValue={initialEmployee?.contract_signer_name ?? ""} className="emp-field-input" placeholder="Nombre completo" />
                </div>
                <div className="emp-form-group">
                  <label className="emp-form-label">Fecha de Firma</label>
                  <input name="contract_signed_at" type="date" defaultValue={initialEmployee?.contract_signed_at ?? ""} className="emp-field-input" />
                </div>
              </div>
            </div>

            {/* TAB 3 - Cuenta App */}
            <div style={{ display: activeTab === 3 ? 'block' : 'none' }}>
              <div className="emp-section-divider">Crear cuenta de acceso</div>
              
              <div className="emp-form-row one">
                 <div className="mb-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateAccount((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${createAccount ? "bg-[#111]" : "bg-[#d1d1d1]"}`}
                    role="switch"
                    aria-checked={createAccount}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${createAccount ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <h3 className="flex-1 text-[12px] font-bold text-[#333]">Habilitar acceso al Dashboard para este empleado</h3>
                </div>
              </div>

              {createAccount && (
                <div className="emp-form-row three mt-4">
                  <div className="emp-form-group">
                    <label className="emp-form-label">Email de acceso</label>
                    <input
                      name="account_email"
                      type="email"
                      required={createAccount}
                      placeholder="usuario@empresa.com"
                      className="emp-field-input"
                    />
                  </div>
                  <div className="emp-form-group">
                    <label className="emp-form-label">Contraseña inicial</label>
                    <input
                      name="account_password"
                      type="password"
                      required={createAccount}
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      className="emp-field-input"
                    />
                  </div>
                  <div className="emp-form-group">
                    <label className="emp-form-label">Rol del usuario</label>
                    <select name="account_role" defaultValue="employee" className="emp-field-select">
                      <option value="employee">Empleado</option>
                      <option value="company_admin">Administrador</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="emp-modal-footer">
            <Link href="/app/employees" className="modal-cancel flex items-center justify-center text-center" style={{ textDecoration: 'none' }}>Cancelar</Link>
            <SubmitButton
              label={mode === "edit" ? "Actualizar Empleado" : "Guardar Empleado"}
              pendingLabel={mode === "edit" ? "Actualizando..." : "Guardando..."}
              pending={isActionPending || saving}
              className="modal-save"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
