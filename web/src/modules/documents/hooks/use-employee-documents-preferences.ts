"use client";

import { useEffect, useState } from "react";

export function useEmployeeDocumentsPreferences({
  organizationId,
  viewerUserId,
  initialViewMode,
}: {
  organizationId: string;
  viewerUserId: string;
  initialViewMode: "tree" | "columns";
}) {
  const [viewMode, setViewMode] = useState<"tree" | "columns">(initialViewMode);
  const [selectedColumnFolderId, setSelectedColumnFolderId] = useState<string | null>(null);
  const [hydratedViewKey, setHydratedViewKey] = useState<string | null>(null);
  const [hydratedFolderKey, setHydratedFolderKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);

    const frame = window.requestAnimationFrame(() => {
      if (stored === "tree" || stored === "columns") {
        setViewMode((prev) => (prev === stored ? prev : stored));
      }
      setHydratedViewKey(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    if (hydratedViewKey !== key) return;
    window.localStorage.setItem(key, viewMode);
  }, [hydratedViewKey, organizationId, viewerUserId, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);

    const frame = window.requestAnimationFrame(() => {
      if (stored) {
        setSelectedColumnFolderId((prev) => (prev === stored ? prev : stored));
      }
      setHydratedFolderKey(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    if (hydratedFolderKey !== key) return;
    if (selectedColumnFolderId) {
      window.localStorage.setItem(key, selectedColumnFolderId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [hydratedFolderKey, organizationId, selectedColumnFolderId, viewerUserId]);

  return {
    viewMode,
    setViewMode,
    selectedColumnFolderId,
    setSelectedColumnFolderId,
  };
}
