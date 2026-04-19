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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    window.localStorage.setItem(key, viewMode);
  }, [organizationId, viewerUserId, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);
    if (stored !== "tree" && stored !== "columns") return;

    const frame = window.requestAnimationFrame(() => {
      setViewMode((prev) => (prev === stored ? prev : stored));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    if (selectedColumnFolderId) {
      window.localStorage.setItem(key, selectedColumnFolderId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [organizationId, selectedColumnFolderId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);
    if (!stored) return;

    const frame = window.requestAnimationFrame(() => {
      setSelectedColumnFolderId((prev) => (prev === stored ? prev : stored));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  return {
    viewMode,
    setViewMode,
    selectedColumnFolderId,
    setSelectedColumnFolderId,
  };
}
