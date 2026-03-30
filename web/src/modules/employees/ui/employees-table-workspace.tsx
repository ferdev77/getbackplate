"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { EmptyState } from "@/shared/ui/empty-state";

type EmployeeRow = {
  recordType: "employee" | "user";
  id: string;
  organizationUserProfileId?: string | null;
  membershipId?: string | null;
  roleCode?: string | null;
  branchId?: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: string;
  dashboardAccess?: boolean;
  hiredAt: string | null;
  branchName: string;
  departmentName: string;
  salaryAmount: number | null;
  salaryCurrency: string | null;
  paymentFrequency: string | null;
  contractStatus: string | null;
  contractSignedAt: string | null;
  birthDate: string | null;
  sex: string | null;
  nationality: string | null;
  addressLine1: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressCountry: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyEmail: string | null;
  pendingDocuments: number;
  docsCompletionStatus?: "complete" | "incomplete";
  docsUploadedCount?: number;
};

type EmployeesTableWorkspaceProps = {
  employees: EmployeeRow[];
};

const ACTION_BTN_NEUTRAL = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] [.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_DANGER = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function statusLabel(status: string) {
  if (status === "active") return "Activo";
  if (status === "inactive") return "Inactivo";
  if (status === "vacation") return "Vacaciones";
  if (status === "leave") return "Baja";
  return status;
}

function statusClass(status: string) {
  if (status === "active") return "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]";
  if (status === "vacation") return "bg-[var(--gbp-violet-soft)] text-[var(--gbp-violet)]";
  if (status === "leave") return "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]";
  return "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]";
}

function formatMoney(amount: number | null, currency: string | null) {
  if (typeof amount !== "number") return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateText: string | null) {
  if (!dateText) return "-";
  return new Date(dateText).toLocaleDateString("es-AR");
}

export function EmployeesTableWorkspace({ employees }: EmployeesTableWorkspaceProps) {
  const [rows, setRows] = useState<EmployeeRow[]>(employees);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState<"" | "employee" | "user">("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("active");
  const [busyStatus, setBusyStatus] = useState(false);

  useEffect(() => {
    setRows(employees);
  }, [employees]);

  const locationOptions = useMemo(
    () => [...new Set(rows.map((item) => item.branchName).filter(Boolean))].sort(),
    [rows],
  );

  const departmentOptions = useMemo(
    () => [...new Set(rows.map((item) => item.departmentName).filter(Boolean))].sort(),
    [rows],
  );

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const fullName = `${row.firstName} ${row.lastName}`.toLowerCase();
      const byQuery = !q || fullName.includes(q) || (row.position || "").toLowerCase().includes(q);
      const byLocation = !location || row.branchName === location;
      const byDepartment = !department || row.departmentName === department;
      const byStatus = !status || row.status === status;
      const byType = !recordTypeFilter || row.recordType === recordTypeFilter;
      return byQuery && byLocation && byDepartment && byStatus && byType;
    });
  }, [department, rows, location, query, status, recordTypeFilter]);

  const activeCount = rows.filter((item) => item.status === "active").length;
  const totalEmployees = rows.filter((item) => item.recordType === "employee").length;
  const totalUsers = rows.filter((item) => item.recordType === "user").length;

  const selected = filteredEmployees.find((item) => item.id === selectedEmployeeId)
    ?? rows.find((item) => item.id === selectedEmployeeId)
    ?? null;

  const deleteTarget = rows.find((item) => item.id === deleteTargetId) ?? null;

  useEffect(() => {
    if (selected) {
      setSelectedStatus(selected.status);
    }
  }, [selected]);

  async function deleteEmployee() {
    if (!deleteTargetId) return;
    const target = rows.find((item) => item.id === deleteTargetId);
    if (!target) return;
    setBusyDelete(true);

    const previousRows = [...rows];
    const targetId = deleteTargetId;
    const isEmployee = target.recordType === "employee";

    // Optimistic Delete
    setRows((prev) => prev.filter((item) => item.id !== targetId));
    setSelectedEmployeeId((prev) => (prev === targetId ? null : prev));
    setDeleteTargetId(null);

    try {
      const payload = isEmployee
        ? { employeeId: targetId }
        : {
            organizationUserProfileId: target.organizationUserProfileId,
            membershipId: target.membershipId,
          };

      const response = await fetch("/api/company/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar registro");
      }

      toast.success(isEmployee ? "Empleado eliminado correctamente" : "Usuario eliminado correctamente");
    } catch (error) {
      // Rollback
      setRows(previousRows);
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar registro");
    } finally {
      setBusyDelete(false);
    }
  }

  async function updateEmployeeStatus() {
    if (!selected) return;
    setBusyStatus(true);

    const previousRows = [...rows];
    const selectedId = selected.id;
    const newStatus = selectedStatus;
    const isEmployee = selected.recordType === "employee";
    const profileId = selected.organizationUserProfileId;

    // Optimistic Update
    setRows((prev) =>
      prev.map((item) => (item.id === selectedId ? { ...item, status: newStatus } : item)),
    );

    try {
      const response = isEmployee
        ? await fetch("/api/company/employees", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: selectedId, status: newStatus }),
          })
        : await fetch("/api/company/employees", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationUserProfileId: profileId,
              status: newStatus,
            }),
          });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar estado");
      }

      toast.success("Estado laboral actualizado correctamente");
    } catch (error) {
      // Rollback
      setRows(previousRows);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar estado laboral");
    } finally {
      setBusyStatus(false);
    }
  }

  async function downloadProfile(row: EmployeeRow) {
    const fullName = `${row.firstName} ${row.lastName}`.trim();
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const left = 46;
      let y = 54;

      doc.setFillColor(17, 17, 17);
      doc.roundedRect(38, 30, 520, 52, 8, 8, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(row.recordType === "employee" ? "Perfil de Empleado" : "Perfil de Usuario", left, y);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, left, y + 16);
      doc.setTextColor(17, 17, 17);
      y += 52;

      doc.setDrawColor(230, 230, 230);
      doc.roundedRect(38, y - 6, 520, 250, 8, 8, "S");
      y += 18;

      const rowsText = [
        ["Nombre", fullName],
        ["Email", row.email || "-"],
        ["Telefono", row.phone || "-"],
        ["Puesto", row.position || "-"],
        ["Locacion", row.branchName],
        ["Departamento", row.departmentName],
        ["Estado laboral", statusLabel(row.status)],
        ["Fecha de ingreso", formatDate(row.hiredAt)],
        ["Salario", formatMoney(row.salaryAmount, row.salaryCurrency)],
        ["Contrato", row.contractStatus || "-"],
        ["Firma contrato", formatDate(row.contractSignedAt)],
        ["Docs", row.recordType === "employee" ? (row.docsCompletionStatus === "complete" ? "Completa" : "Incompleta") : "-"],
      ];

      for (const [label, value] of rowsText) {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, left, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(value), left + 110, y);
        y += 18;
      }

      doc.save(`${fullName.toLowerCase().replace(/\s+/g, "-") || "empleado"}-perfil.pdf`);
    } catch {
      const content = [
         `Perfil de ${row.recordType === "employee" ? "empleado" : "usuario"} - ${fullName}`,
        "",
        `Nombre: ${fullName}`,
        `Email: ${row.email || "-"}`,
        `Telefono: ${row.phone || "-"}`,
        `Puesto: ${row.position || "-"}`,
        `Locacion: ${row.branchName}`,
        `Departamento: ${row.departmentName}`,
        `Estado laboral: ${statusLabel(row.status)}`,
      ].join("\n");

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fullName.toLowerCase().replace(/\s+/g, "-") || "empleado"}-perfil.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
          <p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Total Empleados</p>
          <p className="font-serif text-4xl leading-none font-bold text-[var(--gbp-text)]">{totalEmployees}</p>
        </article>
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
          <p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Total Usuarios</p>
          <p className="font-serif text-4xl leading-none font-bold text-[var(--gbp-text)]">{totalUsers}</p>
        </article>
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
          <p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Activos (Total)</p>
          <p className="font-serif text-4xl leading-none font-bold text-[var(--gbp-text)]">{activeCount}</p>
        </article>
      </section>

      <section className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-[34px] w-[210px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
            placeholder="Buscar usuario/empleado..."
          />
        </div>
        <select
          value={recordTypeFilter}
          onChange={(event) => setRecordTypeFilter(event.target.value as "" | "employee" | "user")}
          className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
        >
          <option value="">Todos</option>
          <option value="employee">Empleado</option>
          <option value="user">Usuario</option>
        </select>
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
        >
          <option value="">Todas las locaciones</option>
          {locationOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
        >
          <option value="">Todos los departamentos</option>
          {departmentOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
        >
          <option value="">Todos los estados laborales</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="vacation">Vacaciones</option>
          <option value="leave">Baja</option>
        </select>
      </section>

      <p className="text-[11px] text-[var(--gbp-text2)]">
        Estado laboral y acceso a plataforma se gestionan por separado.
      </p>

      <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="grid grid-cols-[1fr_80px] gap-x-3 border-b-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-2.5 text-[11px] font-bold tracking-[0.07em] text-[var(--gbp-muted)] uppercase md:grid-cols-[1.5fr_1fr_120px] lg:grid-cols-[2fr_1fr_1.1fr_100px_80px_90px_136px] xl:grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(120px,1.1fr)_minmax(100px,.8fr)_minmax(70px,.6fr)_minmax(110px,.9fr)_minmax(90px,.8fr)_136px]">
          <p>Nombre</p>
          <p className="hidden md:block">Locacion</p>
          <p className="hidden lg:block">Departamento</p>
          <p className="hidden xl:block">Es empleado</p>
          <p className="hidden lg:block">Docs</p>
          <p className="hidden lg:block">Dashboard</p>
          <p className="hidden xl:block">Estado laboral</p>
          <p>Acciones</p>
        </div>
        <div>
          {filteredEmployees.map((row) => {
            const fullName = `${row.firstName} ${row.lastName}`.trim();
            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_80px] items-center gap-x-3 border-b border-[var(--gbp-border)] px-5 py-3 text-left hover:bg-[var(--gbp-bg)] md:grid-cols-[1.5fr_1fr_120px] lg:grid-cols-[2fr_1fr_1.1fr_100px_80px_90px_136px] xl:grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(120px,1.1fr)_minmax(100px,.8fr)_minmax(70px,.6fr)_minmax(110px,.9fr)_minmax(90px,.8fr)_136px]"
                onClick={() => setSelectedEmployeeId(row.id)}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--gbp-accent)] text-[11px] font-bold text-white">{initials(fullName)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--gbp-text)]">{fullName}</p>
                    <p className="truncate text-[11px] text-[var(--gbp-muted)]">{row.position || "Sin puesto"}</p>
                  </div>
                </div>
                <p className="hidden truncate text-xs text-[var(--gbp-text2)] md:block">{row.branchName}</p>
                <p className="hidden truncate text-xs text-[var(--gbp-text2)] lg:block">{row.departmentName}</p>
                <p className="hidden text-xs text-[var(--gbp-text2)] xl:block">{row.recordType === "employee" ? "Si" : "No"}</p>
                <p className="hidden lg:block">
                  {row.recordType === "employee" ? (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.docsCompletionStatus === "complete" ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"}`}>
                      {`${6 - row.pendingDocuments}/6 · ${row.docsCompletionStatus === "complete" ? "Completa" : "Incompleta"}`}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-[var(--gbp-violet-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gbp-violet)]">
                      {`${row.docsUploadedCount ?? 0} cargados`}
                    </span>
                  )}
                </p>
                <p className="hidden lg:block">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.dashboardAccess ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]"}`}>
                    {row.dashboardAccess ? "Con acceso" : "Sin acceso"}
                  </span>
                </p>
                <p className="hidden xl:block">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                </p>
                <div className="flex items-center justify-end gap-1">
                  <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedEmployeeId(row.id); }} className={ACTION_BTN_NEUTRAL} title="Ver perfil"><Eye className="h-3.5 w-3.5" /></button>
                  <Link
                    onClick={(event) => event.stopPropagation()}
                    href={
                      row.recordType === "employee"
                        ? `/app/employees?action=edit&employeeId=${row.id}`
                        : `/app/employees?action=edit-user&profileId=${row.organizationUserProfileId ?? ""}`
                    }
                    className={`hidden sm:inline-flex ${ACTION_BTN_NEUTRAL}`}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button type="button" onClick={(event) => { event.stopPropagation(); downloadProfile(row); }} className={`hidden md:inline-flex ${ACTION_BTN_NEUTRAL}`} title="Descargar perfil"><Download className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteTargetId(row.id); }} className={ACTION_BTN_DANGER} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
          {!filteredEmployees.length ? (
            <EmptyState icon={Users} title="No hay registros" description="No se encontraron usuarios o empleados para los filtros seleccionados." />
          ) : null}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Perfil de {selected.recordType === "employee" ? "Empleado" : "Usuario"}</p>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)]" onClick={() => setSelectedEmployeeId(null)}>✕</button>
            </div>
            <div className="flex items-center gap-4 border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gbp-accent)] text-xl font-bold text-white">
                {initials(`${selected.firstName} ${selected.lastName}`)}
              </div>
              <div>
                <p className="font-serif text-xl font-bold text-[var(--gbp-text)]">{selected.firstName} {selected.lastName}</p>
                <p className="text-xs text-[var(--gbp-muted)]">{selected.position || "Sin puesto"}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(selected.status)}`}>Estado laboral: {statusLabel(selected.status)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected.dashboardAccess ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]"}`}>
                    {selected.dashboardAccess ? "Acceso plataforma: habilitado" : "Acceso plataforma: sin acceso"}
                  </span>
                  <span className="rounded-full bg-[var(--gbp-violet-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gbp-violet)]">{selected.branchName}</span>
                  <span className="rounded-full bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gbp-accent)]">{selected.departmentName}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-3">
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Email</p><p className="text-sm text-[var(--gbp-text)]">{selected.email || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Telefono</p><p className="text-sm text-[var(--gbp-text)]">{selected.phone || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Fecha ingreso</p><p className="text-sm text-[var(--gbp-text)]">{formatDate(selected.hiredAt)}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Nacimiento</p><p className="text-sm text-[var(--gbp-text)]">{formatDate(selected.birthDate)}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Sexo</p><p className="text-sm text-[var(--gbp-text)]">{selected.sex || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Nacionalidad</p><p className="text-sm text-[var(--gbp-text)]">{selected.nationality || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Direccion</p><p className="text-sm text-[var(--gbp-text)]">{selected.addressLine1 || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Ciudad / Estado</p><p className="text-sm text-[var(--gbp-text)]">{[selected.addressCity, selected.addressState].filter(Boolean).join(", ") || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Pais</p><p className="text-sm text-[var(--gbp-text)]">{selected.addressCountry || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Contacto emergencia</p><p className="text-sm text-[var(--gbp-text)]">{selected.emergencyName || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Telefono emergencia</p><p className="text-sm text-[var(--gbp-text)]">{selected.emergencyPhone || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Email emergencia</p><p className="text-sm text-[var(--gbp-text)]">{selected.emergencyEmail || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Contrato</p><p className="text-sm text-[var(--gbp-text)]">{selected.contractStatus || "-"}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Firma contrato</p><p className="text-sm text-[var(--gbp-text)]">{formatDate(selected.contractSignedAt)}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Docs</p><p className="text-sm text-[var(--gbp-text)]">{selected.recordType === "employee" ? `${6 - selected.pendingDocuments}/6 · ${selected.docsCompletionStatus === "complete" ? "Completa" : `Incompleta (${selected.pendingDocuments} faltantes)`}` : `${selected.docsUploadedCount ?? 0} cargados`}</p></div>
            </div>
            <div className="mx-6 mb-5 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
              <p className="mb-1 text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Cambiar estado laboral</p>
              <div className="flex items-center gap-2">
                <select
                  value={selectedStatus}
                  onChange={(event) => setSelectedStatus(event.target.value)}
                  className="h-9 rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  {selected.recordType === "employee" ? <option value="vacation">Vacaciones</option> : null}
                  {selected.recordType === "employee" ? <option value="leave">Baja</option> : null}
                </select>
                <button
                  type="button"
                  disabled={busyStatus || selectedStatus === selected.status}
                  onClick={updateEmployeeStatus}
                  className="rounded-lg bg-[var(--gbp-text)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-60"
                >
                  {busyStatus ? "Guardando..." : "Guardar estado laboral"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]" onClick={() => downloadProfile(selected)}>Descargar</button>
              <button type="button" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]" onClick={() => setSelectedEmployeeId(null)}>Cerrar</button>
                {selected.recordType === "employee" ? (
                 <Link href={`/app/employees?action=edit&employeeId=${selected.id}`} className="rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)]">Editar</Link>
               ) : null}
             </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteDialog
          title={`Eliminar ${deleteTarget.recordType === "employee" ? "empleado" : "usuario"}`}
          description={`Vas a eliminar a ${deleteTarget.firstName} ${deleteTarget.lastName}. Esta accion no se puede deshacer.`}
          busy={busyDelete}
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={deleteEmployee}
          confirmLabel="Eliminar"
        />
      ) : null}
    </>
  );
}
