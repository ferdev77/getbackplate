"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Mail, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { EmptyState } from "@/shared/ui/empty-state";
import type { BranchOption } from "@/shared/contracts/scope-options";

type UserRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roleCode: string;
  status: string;
  branchId: string | null;
  branchName: string;
  createdAt: string;
};

type Option = { value: string; label: string };

type UsersTableWorkspaceProps = {
  users: UserRow[];
  roleOptions: Option[];
  branchOptions: BranchOption[];
  onCreateUser?: () => void;
};

const ACTION_BTN_NEUTRAL = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] [.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function statusLabel(status: string) {
  return status === "active" ? "Activo" : "Inactivo";
}

function roleLabel(code: string) {
  if (code === "company_admin") return "Administrador";
  return "Empleado";
}

export function UsersTableWorkspace({ users, roleOptions, branchOptions, onCreateUser }: UsersTableWorkspaceProps) {
  const [rows, setRows] = useState<UserRow[]>(users);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [editMembershipId, setEditMembershipId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyResend, setBusyResend] = useState(false);

  useEffect(() => {
    setRows(users);
  }, [users]);

  const selected = rows.find((item) => item.membershipId === selectedMembershipId) ?? null;
  const editing = rows.find((item) => item.membershipId === editMembershipId) ?? null;
  const deleteTarget = rows.find((item) => item.membershipId === deleteTargetId) ?? null;

  const [editRole, setEditRole] = useState("employee");
  const [editStatus, setEditStatus] = useState("active");
  const [editBranchId, setEditBranchId] = useState("");

  useEffect(() => {
    if (!editing) return;
    setEditRole(editing.roleCode);
    setEditStatus(editing.status);
    setEditBranchId(editing.branchId ?? "");
  }, [editing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((item) => {
      const byQuery = !q || item.fullName.toLowerCase().includes(q) || item.email.toLowerCase().includes(q);
      const byStatus = !statusFilter || item.status === statusFilter;
      const byLocation = !locationFilter || item.branchName === locationFilter;
      return byQuery && byStatus && byLocation;
    });
  }, [locationFilter, query, rows, statusFilter]);

  const activeCount = rows.filter((item) => item.status === "active").length;

  async function saveUser() {
    if (!editing) return;
    setBusySave(true);

    const previousRows = [...rows];
    const editingId = editing.membershipId;
    const branchName = editBranchId
      ? branchOptions.find((branch) => branch.id === editBranchId)?.name || "Sucursal"
      : "Todas";

    // Optimistic update
    setRows((prev) =>
      prev.map((item) =>
        item.membershipId === editingId
          ? { ...item, roleCode: editRole, status: editStatus, branchId: editBranchId || null, branchName }
          : item,
      ),
    );
    setEditMembershipId(null);

    try {
      const response = await fetch("/api/company/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: editingId,
          roleCode: editRole,
          status: editStatus,
          branchId: editBranchId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar administrador");

      toast.success("Administrador actualizado correctamente");
    } catch (error) {
      // Rollback
      setRows(previousRows);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar administrador");
    } finally {
      setBusySave(false);
    }
  }

  async function deleteUser() {
    if (!deleteTargetId) return;
    setBusyDelete(true);

    const previousRows = [...rows];
    const targetId = deleteTargetId;

    // Optimistic delete
    setRows((prev) => prev.filter((item) => item.membershipId !== targetId));
    setSelectedMembershipId((prev) => (prev === targetId ? null : prev));
    setDeleteTargetId(null);

    try {
      const response = await fetch("/api/company/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: targetId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar administrador");

      toast.success("Administrador eliminado correctamente");
    } catch (error) {
      // Rollback
      setRows(previousRows);
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar administrador");
    } finally {
      setBusyDelete(false);
    }
  }

  async function resendInvitation(user: UserRow) {
    setBusyResend(true);
    try {
      const response = await fetch("/api/company/invitations/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, fullName: user.fullName, roleCode: user.roleCode || "company_admin" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = "No se pudo reenviar invitación";
        const baseMessage = typeof data.error === "string" ? data.error : fallback;
        const message =
          response.status === 404
            ? `${baseMessage} Si no tiene cuenta, crea primero el usuario y luego reenvía.`
            : baseMessage;
        throw new Error(message);
      }
      toast.success(data.message || `Invitación reenviada a ${user.email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al reenviar invitación");
    } finally {
      setBusyResend(false);
    }
  }

  async function downloadUser(user: UserRow) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 46;
    let y = 54;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Perfil de Administrador", left, y);
    y += 24;
    const rowsText = [
      ["Nombre", user.fullName],
      ["Email", user.email],
      ["Rol", roleLabel(user.roleCode)],
      ["Acceso a plataforma", statusLabel(user.status)],
      ["Locación", user.branchName],
      ["Alta", new Date(user.createdAt).toLocaleDateString("es-AR")],
    ];
    doc.setFontSize(11);
    for (const [label, value] of rowsText) {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), left + 100, y);
      y += 18;
    }
    doc.save(`${user.fullName.toLowerCase().replace(/\s+/g, "-")}-administrador.pdf`);
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2">
         <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6"><p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Total Administradores</p><p className="font-serif text-4xl leading-none font-bold text-[var(--gbp-text)]">{rows.length}</p></article>
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6"><p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Activos</p><p className="font-serif text-4xl leading-none font-bold text-[var(--gbp-text)]">{activeCount}</p></article>
      </section>

      <section className="mt-2 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-[34px] w-[210px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs text-[var(--gbp-text)]" placeholder="Buscar administrador..." />
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs text-[var(--gbp-text)]"><option value="">Todas las ubicaciones</option>{[...new Set(rows.map((item) => item.branchName))].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs text-[var(--gbp-text)]"><option value="">Todos los accesos</option><option value="active">Activo</option><option value="inactive">Inactivo</option></select>
      </section>

      <p className="text-[11px] text-[var(--gbp-text2)]">
        Este estado controla el ingreso a la plataforma (no el estado laboral).
      </p>

      <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="grid grid-cols-[1fr_100px] gap-x-3 border-b-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-2.5 text-[11px] font-bold tracking-[0.07em] text-[var(--gbp-muted)] uppercase md:grid-cols-[2fr_1fr_120px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px]">
          <p>Nombre</p>
          <p className="hidden lg:block">Email</p>
          <p className="hidden md:block">Locación</p>
          <p className="hidden lg:block">Acceso</p>
          <p>Acciones</p>
        </div>
        <div>
          {filtered.map((row) => (
            <div key={row.membershipId} onClick={() => setSelectedMembershipId(row.membershipId)} className="grid grid-cols-[1fr_100px] items-center gap-x-3 border-b border-[var(--gbp-border)] px-5 py-3 hover:bg-[var(--gbp-bg)] md:grid-cols-[2fr_1fr_120px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px]">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--gbp-accent)] text-[11px] font-bold text-white">{initials(row.fullName)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{row.fullName}</p>
                  <p className="truncate text-[11px] text-[var(--gbp-muted)]">{roleLabel(row.roleCode)}</p>
                </div>
              </div>
              <p className="hidden truncate text-xs text-[var(--gbp-text2)] lg:block">{row.email || "Sin email"}</p>
              <p className="hidden md:block">
                <span className="inline-flex max-w-full items-center truncate rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[11px] font-medium text-[var(--gbp-accent)]">
                  {row.branchName}
                </span>
              </p>
              <p className="hidden lg:block"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.status === "active" ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]"}`}>{statusLabel(row.status)}</span></p>
              <div className="flex items-center justify-end gap-1">
                <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedMembershipId(row.membershipId); }} className={ACTION_BTN_NEUTRAL}><Eye className="h-3.5 w-3.5" /><TooltipLabel label="Ver perfil" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setEditMembershipId(row.membershipId); }} className={ACTION_BTN_NEUTRAL}><Pencil className="h-3.5 w-3.5" /><TooltipLabel label="Editar" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void resendInvitation(row); }} className={ACTION_BTN_NEUTRAL}><Mail className="h-3.5 w-3.5" /><TooltipLabel label="Reenviar invitación" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void downloadUser(row); }} className={`hidden sm:inline-flex ${ACTION_BTN_NEUTRAL}`}><Download className="h-3.5 w-3.5" /><TooltipLabel label="Descargar perfil" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteTargetId(row.membershipId); }} className={ACTION_BTN_DANGER}><Trash2 className="h-3.5 w-3.5" /><TooltipLabel label="Eliminar" /></button>
              </div>
            </div>
          ))}
          {!filtered.length ? <EmptyState icon={Users} title="No hay administradores" description="No se encontraron administradores para los filtros seleccionados." /> : null}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[90vh] w-[640px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5"><p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Perfil de Administrador</p><button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]" onClick={() => setSelectedMembershipId(null)}>✕</button></div>
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Nombre</p><p className="text-sm text-[var(--gbp-text)]">{selected.fullName}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Email</p><p className="text-sm text-[var(--gbp-text)]">{selected.email}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Rol</p><p className="text-sm text-[var(--gbp-text)]">{roleLabel(selected.roleCode)}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Acceso a plataforma</p><p className="text-sm text-[var(--gbp-text)]">{statusLabel(selected.status)}</p></div>
              <div className="sm:col-span-2">
                <p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Locación</p>
                <div className="mt-1">
                  <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[11px] font-medium text-[var(--gbp-accent)]">
                    {selected.branchName}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" onClick={() => setEditMembershipId(selected.membershipId)} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Editar</button>
              {onCreateUser ? (
                <button type="button" onClick={onCreateUser} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Nuevo administrador</button>
              ) : (
                <Link href="/app/users?action=create-user" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Nuevo administrador</Link>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[90vh] w-[560px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5"><p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Editar Administrador</p><button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]" onClick={() => setEditMembershipId(null)}>✕</button></div>
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Nombre</p><p className="text-sm text-[var(--gbp-text)]">{editing.fullName}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Email</p><p className="text-sm text-[var(--gbp-text)]">{editing.email}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Rol</p><select value={editRole} onChange={(event) => setEditRole(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)]">{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
               <div><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Acceso a plataforma</p><select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)]"><option value="active">Activo</option><option value="inactive">Inactivo</option></select></div>
              <div className="sm:col-span-2"><p className="text-[10px] font-bold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">Locación</p><select value={editBranchId} onChange={(event) => setEditBranchId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)]"><option value="">Todas</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" disabled={busyResend} onClick={() => void resendInvitation(editing)} className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm font-semibold text-[var(--gbp-text2)] transition-all hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent-glow)] hover:text-[var(--gbp-accent)] disabled:opacity-50">{busyResend ? "Enviando..." : "Reenviar Invitación"}</button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditMembershipId(null)} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</button>
                <button type="button" disabled={busySave} onClick={saveUser} className="rounded-lg bg-[var(--gbp-accent)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-muted)] disabled:text-white/80 disabled:hover:bg-[var(--gbp-muted)]">{busySave ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteDialog
          title="Eliminar administrador"
          description="Se removerá el acceso administrativo de esta persona en tu empresa."
          busy={busyDelete}
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={deleteUser}
          confirmLabel="Eliminar"
        />
      ) : null}

    </>
  );
}
