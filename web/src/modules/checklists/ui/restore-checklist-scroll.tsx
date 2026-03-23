"use client";

import { useEffect } from "react";

const SCROLL_KEY = "portal-checklist-scroll-y";

export function RestoreChecklistScroll() {
  useEffect(() => {
    const raw = window.sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return;

    const y = Number(raw);
    window.sessionStorage.removeItem(SCROLL_KEY);
    if (!Number.isFinite(y) || y < 0) return;

    requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);

  return null;
}
