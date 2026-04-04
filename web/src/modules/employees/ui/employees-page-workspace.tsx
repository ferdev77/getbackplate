"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { EmployeesTableWorkspace, type EmployeeRow } from "@/modules/employees/ui/employees-table-workspace";
import { NewEmployeeModal } from "@/modules/employees/ui/new-employee-modal";

type EmployeeDocumentSlot = {
  documentId: string;
  title: string;
  status: string;
};

type InitialEmployeePayload = {
  id: string;
  organization_user_profile_id?: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  phone_country_code: string | null;
  phone: string | null;
  email: string;
  personal_email: string | null;
  document_type: string | null;
  document_number: string | null;
  address: string | null;
  branch_id: string;
  position: string;
  position_id: string;
  department_id: string;
  status: string;
  hire_date: string | null;
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
  has_dashboard_access: boolean;
  documents_by_slot: Record<string, EmployeeDocumentSlot>;
};

type EmployeesPageWorkspaceProps = {
  statusParam?: string;
  messageParam?: string;
  employees: EmployeeRow[];
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; department_id: string; name: string; is_active: boolean }>;
  publisherName: string;
  companyName: string;
  initialModalOpen: boolean;
  initialModalMode: "create" | "edit";
  initialEmployee?: InitialEmployeePayload;
};

export function EmployeesPageWorkspace({
  statusParam,
  messageParam,
  employees,
  branches,
  departments,
  positions,
  publisherName,
  companyName,
  initialModalOpen,
  initialModalMode,
  initialEmployee,
}: EmployeesPageWorkspaceProps) {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialModalOpen && initialModalMode === "create");

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    router.replace("/app/employees");
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Recursos Humanos</p>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Usuarios / Empleados</h1>
            <p className="text-sm text-[var(--gbp-text2)]">Crea usuarios con o sin perfil de empleado y gestiona su estado laboral. El acceso a la plataforma se controla por separado.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)]"
            >
              <Plus className="h-4 w-4" /> Nuevo Usuario / Empleado
            </button>
          </div>
        </div>
      </section>

      {messageParam ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${statusParam === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {messageParam}
        </section>
      ) : null}

      <EmployeesTableWorkspace employees={employees} />

      {isCreateModalOpen ? (
        <NewEmployeeModal
          open
          mode="create"
          onClose={closeCreateModal}
          branches={branches}
          departments={departments}
          positions={positions}
          publisherName={publisherName}
          companyName={companyName}
        />
      ) : null}

      {initialModalOpen && initialModalMode === "edit" && initialEmployee ? (
        <NewEmployeeModal
          open
          mode="edit"
          onClose={() => router.replace("/app/employees")}
          initialEmployee={initialEmployee}
          branches={branches}
          departments={departments}
          positions={positions}
          publisherName={publisherName}
          companyName={companyName}
        />
      ) : null}
    </main>
  );
}
