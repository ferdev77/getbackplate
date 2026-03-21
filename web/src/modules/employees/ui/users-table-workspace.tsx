"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Pencil, Trash2 } from "lucide-react";

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
type BranchOption = { id: string; name: string };

type UsersTableWorkspaceProps = {
  users: UserRow[];
  roleOptions: Option[];
  branchOptions: BranchOption[];
};

const ACTION_BTN_NEUTRAL = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e8e8e8] bg-white text-[#666] hover:bg-[#f6f6f6] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#c8d7ea] [.theme-dark-pro_&]:hover:bg-[#172131]";
const ACTION_BTN_DANGER = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f3cbc4] bg-[#fff3f1] text-[#b63a2f] hover:bg-[#ffe8e4] [.theme-dark-pro_&]:border-[#6a3a42] [.theme-dark-pro_&]:bg-[#2a1c1f] [.theme-dark-pro_&]:text-[#ff9ea7] [.theme-dark-pro_&]:hover:bg-[#352328]";

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
  if (code === "manager") return "Manager";
  return "Empleado";
}

export function UsersTableWorkspace({ users, roleOptions, branchOptions }: UsersTableWorkspaceProps) {
  const [rows, setRows] = useState<UserRow[]>(users);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [editMembershipId, setEditMembershipId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [toast, setToast] = useState("");

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

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
    try {
      const response = await fetch("/api/company/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: editing.membershipId,
          roleCode: editRole,
          status: editStatus,
          branchId: editBranchId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
       if (!response.ok) throw new Error(data.error || "No se pudo actualizar administrador");

      const branchName = editBranchId
        ? branchOptions.find((branch) => branch.id === editBranchId)?.name || "Sucursal"
        : "Todas";

      setRows((prev) =>
        prev.map((item) =>
          item.membershipId === editing.membershipId
            ? { ...item, roleCode: editRole, status: editStatus, branchId: editBranchId || null, branchName }
            : item,
        ),
      );
      setEditMembershipId(null);
      setToast("Administrador actualizado correctamente");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "No se pudo actualizar administrador");
    } finally {
      setBusySave(false);
    }
  }

  async function deleteUser() {
    if (!deleteTargetId) return;
    setBusyDelete(true);
    try {
      const response = await fetch("/api/company/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: deleteTargetId }),
      });
      const data = await response.json().catch(() => ({}));
       if (!response.ok) throw new Error(data.error || "No se pudo eliminar administrador");

      setRows((prev) => prev.filter((item) => item.membershipId !== deleteTargetId));
      setSelectedMembershipId((prev) => (prev === deleteTargetId ? null : prev));
      setDeleteTargetId(null);
      setToast("Administrador eliminado correctamente");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "No se pudo eliminar administrador");
    } finally {
      setBusyDelete(false);
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
      ["Locacion", user.branchName],
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
         <article className="rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white p-6"><p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Total Administradores</p><p className="font-serif text-4xl leading-none font-bold text-[#111]">{rows.length}</p></article>
        <article className="rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white p-6"><p className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Activos</p><p className="font-serif text-4xl leading-none font-bold text-[#111]">{activeCount}</p></article>
      </section>

      <section className="mt-2 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-[34px] w-[210px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs" placeholder="Buscar administrador..." />
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todas las locaciones</option>{[...new Set(rows.map((item) => item.branchName))].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todos los accesos</option><option value="active">Activo</option><option value="inactive">Inactivo</option></select>
      </section>

      <p className="text-[11px] text-[#8b817c]">
        Este estado controla el ingreso a la plataforma (no el estado laboral).
      </p>

      <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white">
        <div className="grid grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px] gap-x-3 border-b-[1.5px] border-[#e8e8e8] bg-[#fafafa] px-5 py-2.5 text-[11px] font-bold tracking-[0.07em] text-[#aaa] uppercase"><p>Nombre</p><p>Email</p><p>Locacion</p><p>Acceso</p><p>Acciones</p></div>
        <div>
          {filtered.map((row) => (
            <div key={row.membershipId} onClick={() => setSelectedMembershipId(row.membershipId)} className="grid grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px] items-center gap-x-3 border-b border-[#f0f0f0] px-5 py-3 hover:bg-[#fafafa]">
              <div className="flex items-center gap-2.5"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c0392b] text-[11px] font-bold text-white">{initials(row.fullName)}</span><div><p className="text-[13px] font-semibold text-[#111]">{row.fullName}</p><p className="text-[11px] text-[#aaa]">{roleLabel(row.roleCode)}</p></div></div>
              <p className="truncate text-xs text-[#666]">{row.email || "Sin email"}</p>
              <p className="text-xs text-[#666]">{row.branchName}</p>
              <p><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.status === "active" ? "bg-[#edfbf3] text-[#27ae60]" : "bg-[#f5f5f5] text-[#888]"}`}>{statusLabel(row.status)}</span></p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedMembershipId(row.membershipId); }} className={ACTION_BTN_NEUTRAL} title="Ver perfil"><Eye className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setEditMembershipId(row.membershipId); }} className={ACTION_BTN_NEUTRAL} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void downloadUser(row); }} className={ACTION_BTN_NEUTRAL} title="Descargar perfil"><Download className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteTargetId(row.membershipId); }} className={ACTION_BTN_DANGER} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {!filtered.length ? <div className="px-5 py-14 text-center text-sm text-[#aaa]">No hay administradores para los filtros seleccionados.</div> : null}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[90vh] w-[640px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5"><p className="font-serif text-[15px] font-bold text-[#111]">Perfil de Administrador</p><button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]" onClick={() => setSelectedMembershipId(null)}>✕</button></div>
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre</p><p className="text-sm text-[#333]">{selected.fullName}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email</p><p className="text-sm text-[#333]">{selected.email}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Rol</p><p className="text-sm text-[#333]">{roleLabel(selected.roleCode)}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Acceso a plataforma</p><p className="text-sm text-[#333]">{statusLabel(selected.status)}</p></div>
              <div className="sm:col-span-2"><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Locacion</p><p className="text-sm text-[#333]">{selected.branchName}</p></div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
              <button type="button" onClick={() => setEditMembershipId(selected.membershipId)} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Editar</button>
              <Link href="/app/users?action=create-user" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Nuevo administrador</Link>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[90vh] w-[560px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5"><p className="font-serif text-[15px] font-bold text-[#111]">Editar Administrador</p><button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]" onClick={() => setEditMembershipId(null)}>✕</button></div>
            <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Nombre</p><p className="text-sm text-[#333]">{editing.fullName}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Email</p><p className="text-sm text-[#333]">{editing.email}</p></div>
              <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Rol</p><select value={editRole} onChange={(event) => setEditRole(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-sm">{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
               <div><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Acceso a plataforma</p><select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-sm"><option value="active">Activo</option><option value="inactive">Inactivo</option></select></div>
              <div className="sm:col-span-2"><p className="text-[10px] font-bold tracking-[0.1em] text-[#aaa] uppercase">Locacion</p><select value={editBranchId} onChange={(event) => setEditBranchId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-sm"><option value="">Todas</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
              <button type="button" onClick={() => setEditMembershipId(null)} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</button>
              <button type="button" disabled={busySave} onClick={saveUser} className="rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b] disabled:opacity-60">{busySave ? "Guardando..." : "Guardar cambios"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/45 p-4" onClick={() => !busyDelete && setDeleteTargetId(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-[#f0f0f0] px-6 py-4"><p className="font-serif text-[18px] font-bold text-[#111]">Eliminar administrador</p><p className="mt-1 text-sm text-[#777]">Se removera el acceso administrativo de esta persona en tu empresa.</p></div>
            <div className="px-6 py-4 text-sm text-[#444]">Vas a eliminar el acceso de <span className="font-semibold">{deleteTarget.fullName}</span>. Esta accion no se puede deshacer.</div>
            <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-6 py-4">
              <button type="button" disabled={busyDelete} onClick={() => setDeleteTargetId(null)} className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333] disabled:opacity-60">Cancelar</button>
              <button type="button" disabled={busyDelete} onClick={deleteUser} className="rounded-lg border-[1.5px] border-[#f3cbc4] bg-[#fff3f1] px-4 py-2 text-sm font-bold text-[#b63a2f] hover:bg-[#ffe8e4] disabled:opacity-60">{busyDelete ? "Eliminando..." : "Eliminar"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="fixed bottom-6 left-1/2 z-[1100] -translate-x-1/2 rounded-lg bg-[#111] px-4 py-2 text-sm font-semibold text-white">{toast}</div> : null}
    </>
  );
}
