"use client";

import { useRouter } from "next/navigation";

import { ChecklistTemplatePreviewModal } from "@/modules/checklists/ui/checklist-template-preview-modal";
import type { RepartoDelHistorial } from "@/modules/checklists/services/checklist-delivery-history.service";

/**
 * El mismo modal de vista previa, para las pantallas que lo abren por URL
 * (`/app/checklists?preview=<id>`) en vez de por estado de React.
 *
 * Existe para poder usar un unico modal en los dos portales. El panel de
 * empresa tenia su propia copia pegada dentro de page.tsx y se habia quedado
 * atras: mostraba la frecuencia leyendo repeat_every, el campo viejo que dice
 * "daily" por defecto aunque el checklist no se reparta nunca.
 */
export function ChecklistPreviewModalRoute(props: {
  templateName: string;
  sections: Array<{ id: string; name: string; items: Array<{ id: string; label: string; priority: string }> }>;
  checklistType?: string | null;
  shift?: string | null;
  scheduledJob?: { recurrence_type?: string | null } | null;
  isActive?: boolean;
  createdByName?: string;
  scopeLabels?: {
    locations: string[];
    departments: string[];
    positions: string[];
    users: string[];
  };
  deliveryHistory?: RepartoDelHistorial[];
  /** Adonde se vuelve al cerrar. */
  closeHref: string;
}) {
  const router = useRouter();
  const { closeHref, ...preview } = props;

  return (
    <ChecklistTemplatePreviewModal
      {...preview}
      onClose={() => router.push(closeHref)}
    />
  );
}
