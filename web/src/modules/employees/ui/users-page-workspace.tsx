"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { UsersTableWorkspace } from "@/modules/employees/ui/users-table-workspace";
import { NewUserModal } from "@/modules/employees/ui/new-user-modal";

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

type UsersPageWorkspaceProps = {
  users: UserRow[];
  roleOptions: Array<{ value: string; label: string }>;
  branchOptions: Array<{ id: string; name: string }>;
  statusParam?: string;
  messageParam?: string;
  initialModalOpen?: boolean;
  deferredDataUrl?: string;
};

export function UsersPageWorkspace({
  users,
  roleOptions,
  branchOptions,
  statusParam,
  messageParam,
  initialModalOpen = false,
  deferredDataUrl,
}: UsersPageWorkspaceProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(initialModalOpen);
  const [deferredSnapshot, setDeferredSnapshot] = useState<{
    users: UserRow[];
    branches: Array<{ id: string; name: string }>;
  } | null>(null);

  useEffect(() => {
    if (!deferredDataUrl) return;
    const controller = new AbortController();
    void fetch(deferredDataUrl, { method: "GET", cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        setDeferredSnapshot((prev) => ({
          users: Array.isArray(data?.users) ? (data.users as UserRow[]) : (prev?.users ?? users),
          branches: Array.isArray(data?.branches)
            ? (data.branches as Array<{ id: string; name: string }>)
            : (prev?.branches ?? branchOptions),
        }));
      })
      .catch(() => {
        // keep current snapshot
      });

    return () => controller.abort();
  }, [branchOptions, deferredDataUrl, users]);

  const effectiveRows = deferredSnapshot?.users ?? users;
  const effectiveBranches = deferredSnapshot?.branches ?? branchOptions;

  const closeModal = () => {
    setIsModalOpen(false);
    router.replace("/app/users");
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Accesos</p>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Administradores</h1>
            <p className="text-sm text-[var(--gbp-text2)]">Gestión de accesos administrativos, credenciales y permisos del sistema.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)]"
            >
              <UserPlus className="h-4 w-4" /> Nuevo Administrador
            </button>
          </div>
        </div>
      </section>

      {messageParam ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${statusParam === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {messageParam}
        </section>
      ) : null}

      <UsersTableWorkspace
        users={effectiveRows}
        roleOptions={roleOptions}
        branchOptions={effectiveBranches}
        onCreateUser={() => setIsModalOpen(true)}
      />

      <NewUserModal
        open={isModalOpen}
        onClose={closeModal}
        branches={effectiveBranches}
        roleOptions={roleOptions}
      />
    </main>
  );
}
