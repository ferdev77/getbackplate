"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const PREVIEW_GUARD_KEY = "portal-checklist-preview-guard";
const PREVIEW_GUARD_TTL_MS = 15000;
const PREVIEW_CACHE_TTL_MS = 60_000;

export type ChecklistTemplateRow = {
  id: string;
};

export type ChecklistPreviewPayload = {
  template: {
    id: string;
    name: string;
    checklist_type: string | null;
    shift: string | null;
    repeat_every: string | null;
    is_active: boolean;
    target_scope: unknown;
    scope_labels: {
      locations: string[];
      departments: string[];
      positions: string[];
      users: string[];
    };
  };
  sections: Array<{ id: string; name: string; items: Array<{ id: string; label: string; priority: string }> }>;
  initialReport:
    | {
        submittedAt: string | null;
        status: string;
        items: Record<string, { checked: boolean; flagged: boolean; comment: string; photos: string[] }>;
      }
    | null;
};

export function useEmployeeChecklistPreview({
  templateRows,
  initialPreviewTemplateId,
  onInitialPreviewConsumed,
}: {
  templateRows: ChecklistTemplateRow[];
  initialPreviewTemplateId?: string;
  onInitialPreviewConsumed?: () => void;
}) {
  const [openTemplateId, setOpenTemplateId] = useState<string>("");
  const [loadingTemplateId, setLoadingTemplateId] = useState<string>("");
  const [payload, setPayload] = useState<ChecklistPreviewPayload | null>(null);
  const cacheRef = useRef<Map<string, { fetchedAt: number; payload: ChecklistPreviewPayload }>>(new Map());
  const consumedInitialPreviewRef = useRef<string>("");

  const fetchPreview = useCallback(async (
    templateId: string,
    options?: { force?: boolean; silent?: boolean; updateActivePayload?: boolean },
  ) => {
    const force = Boolean(options?.force);
    const silent = Boolean(options?.silent);
    const updateActivePayload = options?.updateActivePayload ?? true;
    const cached = cacheRef.current.get(templateId);
    if (!force && cached && Date.now() - cached.fetchedAt <= PREVIEW_CACHE_TTL_MS) {
      if (updateActivePayload) {
        setPayload(cached.payload);
      }
      return cached.payload;
    }

    if (!silent) setLoadingTemplateId(templateId);
    try {
      const response = await fetch(`/api/employee/checklists?preview=${encodeURIComponent(templateId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as ChecklistPreviewPayload | { error?: string } | null;
      if (!response.ok || !data || !("template" in data)) {
        throw new Error((data && "error" in data ? data.error : null) ?? "No se pudo cargar el checklist");
      }
      cacheRef.current.set(templateId, { fetchedAt: Date.now(), payload: data });
      if (updateActivePayload) {
        setPayload(data);
      }
      return data;
    } finally {
      if (!silent) setLoadingTemplateId("");
    }
  }, []);

  const openPreview = useCallback(async (templateId: string) => {
    setOpenTemplateId(templateId);
    const cached = cacheRef.current.get(templateId);
    if (cached) {
      setPayload(cached.payload);
      if (Date.now() - cached.fetchedAt > PREVIEW_CACHE_TTL_MS) {
        void fetchPreview(templateId, { force: true }).catch(() => {
          // keep cached payload
        });
      }
      return;
    }

    try {
      await fetchPreview(templateId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el checklist");
      setOpenTemplateId("");
    }
  }, [fetchPreview]);

  const closePreview = useCallback(() => {
    setOpenTemplateId("");
    setPayload(null);
  }, []);

  const invalidateTemplate = useCallback((templateId: string) => {
    cacheRef.current.delete(templateId);
  }, []);

  useEffect(() => {
    if (!initialPreviewTemplateId) return;
    if (consumedInitialPreviewRef.current === initialPreviewTemplateId) return;
    if (openTemplateId) return;
    if (!templateRows.find((row) => row.id === initialPreviewTemplateId)) return;

    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(PREVIEW_GUARD_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { id?: string; at?: number };
          if (
            parsed?.id === initialPreviewTemplateId &&
            typeof parsed.at === "number" &&
            Date.now() - parsed.at < PREVIEW_GUARD_TTL_MS
          ) {
            return;
          }
        }
        window.sessionStorage.setItem(
          PREVIEW_GUARD_KEY,
          JSON.stringify({ id: initialPreviewTemplateId, at: Date.now() }),
        );
      } catch {
        // ignore storage guard errors
      }
    }

    consumedInitialPreviewRef.current = initialPreviewTemplateId;
    void openPreview(initialPreviewTemplateId);
    onInitialPreviewConsumed?.();
  }, [initialPreviewTemplateId, onInitialPreviewConsumed, openPreview, openTemplateId, templateRows]);

  useEffect(() => {
    if (!templateRows.length) return;
    if (openTemplateId) return;
    const timer = setTimeout(() => {
      templateRows.forEach((template, index) => {
        setTimeout(() => {
          if (cacheRef.current.has(template.id)) return;
          void fetchPreview(template.id, { silent: true, updateActivePayload: false }).catch(() => {
            // ignore silent prefetch failure
          });
        }, index * 120);
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [fetchPreview, openTemplateId, templateRows]);

  return {
    openTemplateId,
    loadingTemplateId,
    payload,
    openPreview,
    closePreview,
    invalidateTemplate,
  };
}
