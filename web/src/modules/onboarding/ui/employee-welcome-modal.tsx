"use client";

import type { LucideIcon } from "lucide-react";
import { Bell, CheckCircle2, ClipboardList, FileText, LayoutDashboard, Loader2, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type Section = {
  id: string;
  tab: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  points: string[];
};

type EmployeeWelcomeModalProps = {
  pendingDocs: number;
  approvedDocs: number;
  contractSigned: boolean;
  finishAction: (formData: FormData) => void;
};

function FinishPortalButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white transition-all hover:-translate-y-[1px] hover:bg-[var(--gbp-accent)] disabled:opacity-50"
      disabled={disabled || pending}
      aria-busy={pending}
      data-testid="welcome-modal-finish-btn"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Ingresando...
        </>
      ) : (
        "Entrar al portal"
      )}
    </button>
  );
}

const BASE_SECTIONS: Section[] = [
  {
    id: "dashboard",
    tab: "Dashboard",
    icon: LayoutDashboard,
    iconBg: "bg-[var(--gbp-accent-glow)]",
    iconColor: "text-[var(--gbp-accent)]",
    title: "Vista general del portal",
    description:
      "Cuando ingresas, el Dashboard te muestra un resumen rápido de lo más importante de tu jornada.",
    points: [
      "Revisa tu bienvenida, locación y datos de tu perfil.",
      "Consulta accesos directos a checklists, avisos y documentos.",
      "Úsalo como punto de inicio antes de navegar a otras secciones.",
    ],
  },
  {
    id: "checklists",
    tab: "Checklists",
    icon: ClipboardList,
    iconBg: "bg-[var(--gbp-accent-glow)]",
    iconColor: "text-[var(--gbp-accent)]",
    title: "Checklists pendientes",
    description:
      "En esta página completas tareas operativas de tu turno y registras evidencias cuando se solicite.",
    points: [
      "Abre cada checklist asignado y completa todos sus ítems.",
      "Si una tarea pide evidencia, carga el archivo o dato requerido.",
      "Guarda y envía para que tu responsable pueda revisarlo.",
    ],
  },
  {
    id: "announcements",
    tab: "Avisos",
    icon: Bell,
    iconBg: "bg-[var(--gbp-accent-glow)]",
    iconColor: "text-[var(--gbp-accent)]",
    title: "Comunicados del equipo",
    description:
      "En Avisos encuentras avisos oficiales, recordatorios y novedades que impactan tu trabajo diario.",
    points: [
      "Prioriza avisos urgentes o con fecha de vencimiento.",
      "Lee el detalle completo para entender responsables y plazos.",
      "Vuelve a esta sección al inicio de cada turno.",
    ],
  },
  {
    id: "documents",
    tab: "Documentos",
    icon: FolderOpen,
    iconBg: "bg-[var(--gbp-success-soft)]",
    iconColor: "text-[var(--gbp-success)]",
    title: "Biblioteca de documentos",
    description:
      "Aquí tienes los documentos que te corresponden por puesto, locación o asignación directa.",
    points: [
      "Descarga y revisa archivos operativos cuando lo necesites.",
      "Mantente al día con versiones y documentos nuevos.",
      "Usa esta sección como referencia oficial de tu operación.",
    ],
  },
  {
    id: "instructions",
    tab: "Instrucciones",
    icon: FileText,
    iconBg: "bg-[var(--gbp-success-soft)]",
    iconColor: "text-[var(--gbp-success)]",
    title: "Instrucciones y seguimiento",
    description:
      "La sección Instrucciones concentra guías de uso para ayudarte a trabajar con orden dentro de la plataforma.",
    points: [
      "Consulta pasos sugeridos para completar tus tareas del portal.",
      "Si tienes dudas, valida primero esta sección antes de escalar.",
      "Canal de soporte: encargado directo o equipo de RRHH.",
    ],
  },
];

export function EmployeeWelcomeModal({
  pendingDocs,
  approvedDocs,
  contractSigned,
  finishAction,
}: EmployeeWelcomeModalProps) {
  const sections = useMemo(() => {
    return BASE_SECTIONS.map((section) =>
      section.id === "documents"
        ? {
            ...section,
            points: [
              "Descarga y revisa archivos operativos cuando lo necesites.",
              "Mantente al día con versiones y documentos nuevos.",
              `Documentos aprobados: ${approvedDocs}`,
              `Documentos pendientes: ${pendingDocs}`,
              `Estado de contrato: ${contractSigned ? "completado" : "pendiente"}`,
            ],
          }
        : section,
    );
  }, [approvedDocs, pendingDocs, contractSigned]);

  const [step, setStep] = useState(0);
  const [readChecks, setReadChecks] = useState<boolean[]>(() => sections.map(() => false));
  const [panelVisible, setPanelVisible] = useState(true);

  const goTo = (nextStep: number) => {
    if (nextStep === step) return;
    setPanelVisible(false);
    window.setTimeout(() => {
      setStep(nextStep);
      setPanelVisible(true);
    }, 110);
  };

  const current = sections[step];
  const CurrentIcon = current.icon;
  const isLast = step === sections.length - 1;
  const currentChecked = readChecks[step];
  const allChecked = readChecks.every(Boolean);
  const progress = Math.round(((step + 1) / sections.length) * 100);

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/55 p-2 sm:p-4">
      <div className="flex max-h-[96vh] w-[940px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.3)] sm:max-h-[90vh] sm:max-w-[97vw]">

        {/* Header */}
        <div className="relative shrink-0 overflow-hidden border-b border-black/30 bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] px-4 py-3 text-white sm:px-8 sm:py-5">
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.35),transparent_70%)]" />
          <div className="absolute -left-8 -bottom-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.2),transparent_70%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65 sm:block">Portal Interno - Empleados</p>
              <h2 className="mt-0 font-serif text-xl font-bold leading-tight sm:mt-1 sm:text-3xl">Recorrido del portal</h2>
              <p className="hidden text-sm text-white/70 sm:mt-1 sm:block">Revisa estas secciones para entender dónde encontrar cada herramienta de trabajo.</p>
            </div>
            <div className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              {step + 1}/{sections.length}
            </div>
          </div>
        </div>

        {/* Tabs y progreso */}
        <div className="shrink-0 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-2 sm:px-8 sm:py-3">
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--gbp-bg)] sm:mb-3">
            <div className="h-full rounded-full bg-[var(--gbp-accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => goTo(index)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all duration-200 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-xs ${
                  index === step
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] shadow-[0_4px_14px_rgba(192,57,43,.15)]"
                    : readChecks[index]
                      ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                      : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-bg)]"
                }`}
              >
                {readChecks[index] ? <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : null}
                {section.tab}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido scrolleable — ocupa todo el espacio restante entre header y footer */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          <article className={`rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition-all duration-200 sm:p-7 ${panelVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
            <div className="mb-3 flex items-center gap-3 sm:mb-4">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${current.iconBg}`}>
                <CurrentIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${current.iconColor}`} />
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-[var(--gbp-text)] sm:text-2xl">{current.title}</h3>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gbp-text2)]">{current.tab}</p>
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--gbp-text2)] sm:leading-8">{current.description}</p>

            <div className="mt-4 space-y-2 sm:mt-5">
              {current.points.map((point) => (
                <div key={point} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] transition-colors hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-surface)]">
                  {point}
                </div>
              ))}
            </div>

            <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] sm:mt-6">
              <input
                type="checkbox"
                checked={currentChecked}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setReadChecks((prev) => {
                    const next = [...prev];
                    next[step] = checked;
                    return next;
                  });
                }}
                className="h-4 w-4 accent-[var(--gbp-accent)]"
              />
              He leído y comprendido esta sección
            </label>
          </article>
        </div>

        {/* Footer — siempre visible */}
        <div className="shrink-0 flex items-center justify-between border-t border-[var(--gbp-border)] px-4 py-3 sm:px-8 sm:py-4">
          <button
            type="button"
            onClick={() => goTo(Math.max(0, step - 1))}
            className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] transition-all hover:-translate-y-[1px] hover:bg-[var(--gbp-bg)] disabled:opacity-40"
            disabled={step === 0}
          >
            Anterior
          </button>

          {!isLast ? (
            <button
              type="button"
              onClick={() => goTo(Math.min(sections.length - 1, step + 1))}
              className="rounded-lg bg-[var(--gbp-text)] px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-[1px] hover:bg-[var(--gbp-accent)] disabled:opacity-50"
              disabled={!currentChecked}
            >
              Siguiente
            </button>
          ) : (
            <form action={finishAction}>
              <FinishPortalButton disabled={!allChecked} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
