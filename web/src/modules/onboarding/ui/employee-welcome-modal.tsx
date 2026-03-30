"use client";

import type { LucideIcon } from "lucide-react";
import { BriefcaseBusiness, CheckCircle2, HeartHandshake, Loader2, ShieldCheck, Users } from "lucide-react";
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
    id: "values",
    tab: "Valores",
    icon: HeartHandshake,
    iconBg: "bg-[var(--gbp-accent-glow)]",
    iconColor: "text-[var(--gbp-accent)]",
    title: "Cultura y valores",
    description:
      "En Juan's trabajamos en equipo, con respeto y foco en la experiencia del cliente.",
    points: [
      "Actitud de servicio en cada turno.",
      "Comunicacion clara con el equipo y gerencia.",
      "Cuidado de la marca y del ambiente de trabajo.",
    ],
  },
  {
    id: "service",
    tab: "Servicio",
    icon: Users,
    iconBg: "bg-[var(--gbp-violet-soft)]",
    iconColor: "text-[var(--gbp-violet)]",
    title: "Estandar de servicio",
    description:
      "Revisa los protocolos de atencion para mantener calidad consistente en cada sucursal.",
    points: [
      "Saludo inicial y cierre de servicio obligatorio.",
      "Tiempo de respuesta segun protocolo operativo.",
      "Escalado de incidentes con tu encargado directo.",
    ],
  },
  {
    id: "operations",
    tab: "Operaciones",
    icon: BriefcaseBusiness,
    iconBg: "bg-[var(--gbp-violet-soft)]",
    iconColor: "text-[var(--gbp-violet)]",
    title: "Operacion diaria",
    description:
      "Tus documentos y procesos estan organizados por puesto, departamento y locacion.",
    points: [
      "Usa " + '"Mis Documentos"' + " para acceder solo a lo asignado.",
      "Sigue checklists del turno y registra evidencias cuando aplique.",
      "No compartas archivos internos fuera de la plataforma.",
    ],
  },
  {
    id: "hr",
    tab: "RRHH",
    icon: ShieldCheck,
    iconBg: "bg-[var(--gbp-success-soft)]",
    iconColor: "text-[var(--gbp-success)]",
    title: "Politicas de RRHH",
    description:
      "Antes de entrar al portal debes confirmar que leiste estas politicas y reglas de uso.",
    points: [
      "Credenciales personales e intransferibles.",
      "Respeto de politicas de privacidad y datos internos.",
      "Canal de soporte: gerente directo o RRHH.",
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
      section.id === "operations"
        ? {
            ...section,
            points: [
              `Documentos aprobados: ${approvedDocs}`,
              `Documentos pendientes: ${pendingDocs}`,
              `Contrato: ${contractSigned ? "completado" : "pendiente"}`,
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
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[90vh] w-[940px] max-w-[97vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.3)]">
        <div className="relative overflow-hidden border-b border-black/30 bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] px-8 py-5 text-white">
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.35),transparent_70%)]" />
          <div className="absolute -left-8 -bottom-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.2),transparent_70%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-white/65 uppercase">Portal Interno - Empleados</p>
              <h2 className="mt-1 font-serif text-[30px] font-bold leading-tight">Bienvenido</h2>
               <p className="mt-1 text-sm text-white/70">Completa esta induccion para habilitar el acceso final al portal.</p>
            </div>
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              Paso {step + 1}/{sections.length}
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-8 py-3">
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--gbp-bg)]">
            <div className="h-full rounded-full bg-[var(--gbp-accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => goTo(index)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                  index === step
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] shadow-[0_4px_14px_rgba(192,57,43,.15)]"
                    : readChecks[index]
                      ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                      : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-bg)]"
                }`}
              >
                {readChecks[index] ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {section.tab}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[56vh] overflow-y-auto px-8 py-6">
          <article className={`rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-7 transition-all duration-200 ${panelVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
            <div className="mb-4 flex items-center gap-3">
              <div className={`grid h-11 w-11 place-items-center rounded-xl ${current.iconBg}`}>
                <CurrentIcon className={`h-5 w-5 ${current.iconColor}`} />
              </div>
              <div>
                <h3 className="font-serif text-[24px] font-bold text-[var(--gbp-text)]">{current.title}</h3>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gbp-text2)]">{current.tab}</p>
              </div>
            </div>
            <p className="mt-2 text-[14px] leading-8 text-[var(--gbp-text2)]">{current.description}</p>

            <div className="mt-5 space-y-2">
              {current.points.map((point) => (
                <div key={point} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-[13px] text-[var(--gbp-text)] transition-colors hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-surface)]">
                  {point}
                </div>
              ))}
            </div>

            <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]">
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
              He leido y comprendido esta seccion
            </label>
          </article>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--gbp-border)] px-8 py-4">
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
