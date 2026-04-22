"use client";

import type { Dispatch, SetStateAction } from "react";

type DelegatedPermissionModuleCode = "announcements" | "checklists" | "documents" | "ai_assistant";
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
  { code: "announcements", label: "Avisos" },
  { code: "checklists", label: "Checklists" },
  { code: "documents", label: "Documentos Operativos" },
  { code: "ai_assistant", label: "Asistente IA" },
];

const CAPABILITIES: DelegatedPermissionCapability[] = ["create", "edit", "delete"];

const CAPABILITY_LABELS: Record<DelegatedPermissionCapability, string> = {
  create: "Crear",
  edit: "Editar",
  delete: "Eliminar",
};

function capabilityLabel(moduleCode: DelegatedPermissionModuleCode, capability: DelegatedPermissionCapability) {
  if (moduleCode === "documents") {
    if (capability === "create") return "Subir";
    if (capability === "edit") return "Editar propios";
    if (capability === "delete") return "Eliminar propios";
  }
  if (moduleCode === "ai_assistant") {
    if (capability === "create") return "Usar IA";
    if (capability === "edit") return "Configurar";
    if (capability === "delete") return "Reiniciar";
  }
  return CAPABILITY_LABELS[capability];
}

function visibleCapabilities(moduleCode: DelegatedPermissionModuleCode) {
  if (moduleCode === "ai_assistant") {
    return ["create"] as DelegatedPermissionCapability[];
  }
  return CAPABILITIES;
}

export function DelegatedPermissionsSection({ delegatedPermissions, setDelegatedPermissions }: Props) {
  return (
    <>
      <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
        Permisos Delegados por Módulo
      </h3>

      <p className="mb-5 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs text-[var(--gbp-text2)]">
        Estos permisos aplican al portal de empleado. Editar y eliminar solo se permitirá sobre contenido creado por este usuario.
        En Documentos, <strong>Subir</strong> habilita carga de archivos y organización visual (filtros/orden) de sus propios documentos.
        En <strong>Asistente IA</strong>, el permiso <strong>Usar IA</strong> habilita el asistente en el panel del empleado.
      </p>

      <div className="space-y-4">
        {MODULES.map((moduleItem) => (
          <article key={moduleItem.code} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-[var(--gbp-text)]">{moduleItem.label}</p>
              <div className="flex flex-wrap items-center gap-2">
                {visibleCapabilities(moduleItem.code).map((capability) => {
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
                            ...(moduleItem.code === "ai_assistant" ? { edit: false, delete: false } : {}),
                          },
                        }));
                      }}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                        checked
                          ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                          : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                      }`}
                    >
                      {capabilityLabel(moduleItem.code, capability)}
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
