"use client";

import type { Dispatch, SetStateAction } from "react";

type DelegatedPermissionModuleCode = "announcements" | "checklists" | "documents";
type DelegatedPermissionCapability = "create" | "edit" | "delete";

type DelegatedPermissionsState = Record<
  DelegatedPermissionModuleCode,
  Record<DelegatedPermissionCapability, boolean>
>;

type Props = {
  delegatedPermissions: DelegatedPermissionsState;
  setDelegatedPermissions: Dispatch<SetStateAction<DelegatedPermissionsState>>;
};

const MODULES: Array<{ code: DelegatedPermissionModuleCode; label: string }> = [
  { code: "announcements", label: "Anuncios" },
  { code: "checklists", label: "Checklists" },
  { code: "documents", label: "Documentos Operativos" },
];

const CAPABILITIES: DelegatedPermissionCapability[] = ["create", "edit", "delete"];

const CAPABILITY_LABELS: Record<DelegatedPermissionCapability, string> = {
  create: "Crear",
  edit: "Editar",
  delete: "Eliminar",
};

export function DelegatedPermissionsSection({ delegatedPermissions, setDelegatedPermissions }: Props) {
  return (
    <>
      <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
        Permisos Delegados por Módulo
      </h3>

      <p className="mb-5 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs text-[var(--gbp-text2)]">
        Estos permisos aplican al portal de empleado. Editar y eliminar solo se permitirá sobre contenido creado por este usuario.
      </p>

      <div className="space-y-4">
        {MODULES.map((moduleItem) => (
          <article key={moduleItem.code} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-[var(--gbp-text)]">{moduleItem.label}</p>
              <div className="flex flex-wrap items-center gap-2">
                {CAPABILITIES.map((capability) => {
                  const checked = delegatedPermissions[moduleItem.code][capability];

                  return (
                    <button
                      key={`${moduleItem.code}-${capability}`}
                      type="button"
                      onClick={() => {
                        setDelegatedPermissions((prev) => ({
                          ...prev,
                          [moduleItem.code]: {
                            ...prev[moduleItem.code],
                            [capability]: !prev[moduleItem.code][capability],
                          },
                        }));
                      }}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                        checked
                          ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                          : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                      }`}
                    >
                      {CAPABILITY_LABELS[capability]}
                    </button>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
