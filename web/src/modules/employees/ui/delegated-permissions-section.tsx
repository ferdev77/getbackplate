"use client";

import type { Dispatch, SetStateAction } from "react";

type DelegatedPermissionModuleCode = "announcements" | "checklists" | "documents" | "vendors" | "ai_assistant";
type DelegatedPermissionCapability = "view" | "create" | "edit" | "delete";

type DelegatedPermissionsState = Record<
  DelegatedPermissionModuleCode,
  Record<DelegatedPermissionCapability, boolean>
>;

type Props = {
  delegatedPermissions: DelegatedPermissionsState;
  setDelegatedPermissions: Dispatch<SetStateAction<DelegatedPermissionsState>>;
  enabledModules?: string[];
};

const MODULES: Array<{ code: DelegatedPermissionModuleCode; label: string }> = [
  { code: "announcements", label: "Avisos" },
  { code: "checklists", label: "Checklists" },
  { code: "documents", label: "Documentos Operativos" },
  { code: "vendors", label: "Proveedores" },
  { code: "ai_assistant", label: "Asistente IA" },
];

const CAPABILITIES: DelegatedPermissionCapability[] = ["view", "create", "edit", "delete"];

const CAPABILITY_LABELS: Record<DelegatedPermissionCapability, string> = {
  view: "Ver",
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
  if (moduleCode === "vendors") {
    if (capability === "view") return "Ver";
    if (capability === "create") return "Crear";
    if (capability === "edit") return "Editar";
    if (capability === "delete") return "Eliminar";
  }
  return CAPABILITY_LABELS[capability];
}

function visibleCapabilities(moduleCode: DelegatedPermissionModuleCode) {
  if (moduleCode === "ai_assistant") {
    return ["create"] as DelegatedPermissionCapability[];
  }
  if (moduleCode === "vendors") {
    return ["view", "create", "edit", "delete"] as DelegatedPermissionCapability[];
  }
  return CAPABILITIES;
}

export function DelegatedPermissionsSection({ delegatedPermissions, setDelegatedPermissions, enabledModules }: Props) {
  const visibleModules = enabledModules
    ? MODULES.filter((m) => enabledModules.includes(m.code))
    : MODULES;

  return (
    <>
      <h3 className="mb-6 border-b border-[var(--gbp-border)] pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gbp-muted)]">
        Permisos Delegados por Módulo
      </h3>

      <p className="mb-5 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs text-[var(--gbp-text2)]">
        Estos permisos aplican al portal de empleado. Editar y eliminar solo se permitirá sobre contenido creado por este usuario.
        En Documentos, <strong>Subir</strong> habilita carga de archivos y organización visual (filtros/orden) de sus propios documentos.
        En <strong>Proveedores</strong>, <strong>Ver</strong> habilita el acceso a la pantalla y luego podés delegar Crear, Editar o Eliminar.
        En <strong>Asistente IA</strong>, el permiso <strong>Usar IA</strong> habilita el asistente en el panel del empleado.
      </p>

      <div className="space-y-4">
        {visibleModules.map((moduleItem) => (
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
                            ...(moduleItem.code === "vendors" && capability !== "view" && !prev[moduleItem.code][capability]
                              ? { view: true }
                              : {}),
                            ...(moduleItem.code === "vendors" && capability === "view" && prev[moduleItem.code].view
                              ? { create: false, edit: false, delete: false }
                              : {}),
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
