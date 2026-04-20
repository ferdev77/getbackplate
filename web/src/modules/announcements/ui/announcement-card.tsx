"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, Pin } from "lucide-react";

import { parseAnnouncementScope } from "@/modules/announcements/lib/scope";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";

type AnnouncementCardRow = {
  id: string;
  title: string;
  body: string;
  kind: string | null;
  is_featured: boolean;
  publish_at: string | null;
  created_at: string;
  expires_at: string | null;
  target_scope: unknown;
};

function kindLabel(kind: string | null) {
  if (kind === "urgent") return "Urgente";
  if (kind === "reminder") return "Recordatorio";
  if (kind === "celebration") return "Celebracion";
  return "General";
}

function kindClass(kind: string | null) {
  if (kind === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (kind === "reminder") return "border-amber-200 bg-amber-50 text-amber-700";
  if (kind === "celebration") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

type Props = {
  announcement: AnnouncementCardRow;
  authorName: string;
  todayIso: string;
  showAudience?: boolean;
  defaultExpanded?: boolean;
  branchNameMap?: Map<string, string>;
  departmentNameMap?: Map<string, string>;
  positionNameMap?: Map<string, string>;
  actions?: ReactNode;
};

export function AnnouncementCard({
  announcement,
  authorName,
  todayIso,
  showAudience = true,
  defaultExpanded = false,
  branchNameMap,
  departmentNameMap,
  positionNameMap,
  actions,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const target = parseAnnouncementScope(announcement.target_scope);
  const scopedLocations = target.locations;
  const scopedDepartments = target.department_ids;
  const scopedPositions = target.position_ids;
  const scopedUsers = target.users;
  const hasAudience =
    scopedLocations.length > 0 || scopedDepartments.length > 0 || scopedPositions.length > 0 || scopedUsers.length > 0;

  const publishLabel = announcement.publish_at ? new Date(announcement.publish_at).toLocaleDateString("es-AR") : "-";

  const expirationBadge = announcement.expires_at
    ? (() => {
        const datePart = announcement.expires_at.slice(0, 10);
        const badgeClass =
          datePart < todayIso
            ? "border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"
            : "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]";
        const prefix = datePart < todayIso ? "Vencio" : datePart === todayIso ? "Vence hoy" : "Por vencer";
        return (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${badgeClass}`}>
            <CalendarClock className="h-3 w-3" /> {prefix}: {new Date(announcement.expires_at).toLocaleDateString("es-AR")}
          </span>
        );
      })()
    : null;

  return (
    <article className={`rounded-xl border-[1.5px] px-5 py-4 border-[var(--gbp-border)] bg-[var(--gbp-surface)] ${announcement.is_featured ? "border-l-[3.5px] border-l-[var(--gbp-accent)]" : ""}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="truncate text-sm font-bold text-[var(--gbp-text)]">{announcement.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--gbp-text2)]">
            <span>📅 {publishLabel} · {authorName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-start">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${kindClass(announcement.kind)}`}>{kindLabel(announcement.kind)}</span>
          {announcement.is_featured ? <span className="inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gbp-accent)]"><Pin className="h-3 w-3" /> FIJADO</span> : null}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
            aria-label={expanded ? "Contraer aviso" : "Expandir aviso"}
            title={expanded ? "Contraer" : "Expandir"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ${expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          {expirationBadge ? <div className="mb-2 text-[11px]">{expirationBadge}</div> : null}
          <p className="text-sm leading-6 text-[var(--gbp-text2)]">{announcement.body}</p>

          {showAudience ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[var(--gbp-text2)]">Para:</span>
              {!hasAudience ? <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] text-[var(--gbp-text2)]">Todos los empleados</span> : null}
              {scopedLocations.length > 0 && <ScopePillsOverflow pills={scopedLocations.map((id) => ({ name: branchNameMap?.get(id) ?? "Sucursal", type: "location" as const }))} max={4} />}
              {scopedDepartments.length > 0 && <ScopePillsOverflow pills={scopedDepartments.map((id) => ({ name: departmentNameMap?.get(id) ?? "Departamento", type: "department" as const }))} max={4} />}
              {scopedPositions.length > 0 && <ScopePillsOverflow pills={scopedPositions.map((id) => ({ name: positionNameMap?.get(id) ?? "Puesto", type: "position" as const }))} max={4} />}
            </div>
          ) : null}

          {actions ? <div className="mt-3 flex items-center justify-end"><div className="flex items-center gap-1">{actions}</div></div> : null}
        </div>
      </div>
    </article>
  );
}
