"use client";

type DocumentViewModeScope = "company" | "employee";

export function trackDocumentViewModeChange(params: {
  scope: DocumentViewModeScope;
  mode: "tree" | "columns";
  organizationId: string;
  userId: string;
}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("gbp:documents:view-mode-changed", {
      detail: {
        scope: params.scope,
        mode: params.mode,
        organizationId: params.organizationId,
        userId: params.userId,
        timestamp: new Date().toISOString(),
      },
    }),
  );

  if (process.env.NODE_ENV === "development") {
    console.debug("[documents:view-mode]", {
      scope: params.scope,
      mode: params.mode,
      organizationId: params.organizationId,
      userId: params.userId,
    });
  }
}
