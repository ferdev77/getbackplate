/**
 * useDndSafetyNet — Safety net for HTML5 Drag-and-Drop state leaks.
 *
 * Problem:
 *   HTML5 DnD relies on `dragend` events to clean up state.
 *   If the dragged element is unmounted mid-drag (e.g. React re-render from
 *   Supabase Realtime, AnimatePresence exit, or router.refresh()), `onDragEnd`
 *   never fires. This leaves React state stuck (`draggedDocumentId`, refs, etc.)
 *   and the browser's internal drag tracker in a broken state — preventing
 *   future drag operations until a full page reload.
 *
 * Solution layers:
 *   1. Global `document.addEventListener("dragend")` — catches drag-end events
 *      even when the source React element was unmounted.
 *   2. Global `window.__gbp_dnd_active` flag — signals the EmployeeShell (and
 *      any other polling component) to SKIP `router.refresh()` while a drag
 *      is in progress.  This prevents React reconciliation from destroying
 *      DOM nodes mid-drag.
 *   3. Deferred refresh — queues a refresh for after drag-end if one was
 *      requested during drag.
 *   4. `resetOnPropsSync()` — call from props-sync useEffects to clean up
 *      any stale DnD state when new server data arrives.
 *
 * Usage:
 *   const { guardedRefresh, resetOnPropsSync } = useDndSafetyNet({
 *     resetDndState,
 *     isDragActive: () => Boolean(draggedDocumentId || draggedFolderId),
 *     onDeferredRefresh: () => router.refresh(),
 *   });
 *
 * @see DOCS/DND_SAFETY_NET.md
 */
"use client";

import { useCallback, useEffect, useRef } from "react";

// ── Global DnD flag ──
// Accessible from any component (e.g. EmployeeShell) to know if a drag is
// happening anywhere in the app.  Avoids prop-drilling and context wiring.
declare global {
  interface Window {
    __gbp_dnd_active?: boolean;
  }
}

/** Call from onDragStart to signal that a drag is active app-wide. */
export function markDndActive() {
  if (typeof window !== "undefined") window.__gbp_dnd_active = true;
}

/** Call from onDragEnd / resetDndState to clear the flag. */
export function markDndInactive() {
  if (typeof window !== "undefined") window.__gbp_dnd_active = false;
}

/** Check if a drag is currently active (used by Shell polling). */
export function isDndActive(): boolean {
  if (typeof window === "undefined") return false;
  return window.__gbp_dnd_active === true;
}

type UseDndSafetyNetOptions = {
  /** Function that resets all DnD-related React state and refs. */
  resetDndState: () => void;
  /** Returns true when a drag operation is in progress. */
  isDragActive: () => boolean;
  /** Called when a deferred refresh should execute (typically `router.refresh`). */
  onDeferredRefresh: () => void;
};

export function useDndSafetyNet({
  resetDndState,
  isDragActive,
  onDeferredRefresh,
}: UseDndSafetyNetOptions) {
  const pendingRefreshRef = useRef(false);
  const isDragActiveRef = useRef(isDragActive);
  const resetDndStateRef = useRef(resetDndState);
  const onDeferredRefreshRef = useRef(onDeferredRefresh);

  // Keep refs in sync without re-triggering effects.
  useEffect(() => {
    isDragActiveRef.current = isDragActive;
    resetDndStateRef.current = resetDndState;
    onDeferredRefreshRef.current = onDeferredRefresh;
  }, [isDragActive, resetDndState, onDeferredRefresh]);

  // ──────────────────────────────────────────────
  // Layer 1: Global dragend listener
  // ──────────────────────────────────────────────
  useEffect(() => {
    function handleGlobalDragEnd() {
      // Always clear the global flag first
      markDndInactive();

      if (isDragActiveRef.current()) {
        resetDndStateRef.current();
      }
      // Flush any deferred refresh that was waiting for drag-end.
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        // Small delay so the state cleanup tick completes first.
        window.setTimeout(() => onDeferredRefreshRef.current(), 60);
      }
    }

    function handleGlobalDragStart() {
      markDndActive();
    }

    document.addEventListener("dragstart", handleGlobalDragStart);
    document.addEventListener("dragend", handleGlobalDragEnd);
    return () => {
      document.removeEventListener("dragstart", handleGlobalDragStart);
      document.removeEventListener("dragend", handleGlobalDragEnd);
    };
  }, []);

  // ──────────────────────────────────────────────
  // Layer 2: Guarded refresh (defer during drag)
  // ──────────────────────────────────────────────
  const guardedRefresh = useCallback(() => {
    if (isDragActiveRef.current()) {
      pendingRefreshRef.current = true;
      return;
    }
    onDeferredRefreshRef.current();
  }, []);

  // ──────────────────────────────────────────────
  // Layer 3: Reset on props sync
  // ──────────────────────────────────────────────
  const resetOnPropsSync = useCallback(() => {
    if (isDragActiveRef.current()) {
      resetDndStateRef.current();
    }
  }, []);

  return { guardedRefresh, resetOnPropsSync, pendingRefreshRef };
}
