"use client";

import { createElement } from "react";

type Props = {
  open: boolean;
  src: string | null;
  signerEmail: string;
  docusealReady: boolean;
  docusealLoadFailed: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenInNewTab: () => void;
};

export function EmployeeSignatureModal({
  open,
  src,
  signerEmail,
  docusealReady,
  docusealLoadFailed,
  onClose,
  onRefresh,
  onOpenInNewTab,
}: Props) {
  if (!open || !src) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md transition-all duration-300" />
      <div className="relative flex h-[90vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--gbp-surface)] shadow-[0_0_80px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between border-b border-[var(--gbp-border)] bg-[color:color-mix(in_oklab,var(--gbp-bg)_95%,transparent)] px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] shadow-sm">
              <svg className="h-5 w-5 text-[var(--gbp-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.48 9.55l-2.98 2.98a2.11 2.11 0 01-2.98 0l-3.53-3.53a2.11 2.11 0 010-2.98l2.98-2.98a2.11 2.11 0 012.98 0l3.53 3.53a2.11 2.11 0 010 2.98z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-[var(--gbp-text)]">Firma del documento</h3>
              <p className="text-xs font-medium text-[var(--gbp-text2)]">Firma criptográficamente segura</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRefresh}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--gbp-bg)] px-3.5 py-2 text-xs font-bold text-[var(--gbp-text2)] ring-1 ring-inset ring-[var(--gbp-border2)] transition-all hover:bg-[var(--gbp-surface)] hover:text-[var(--gbp-text)] hover:shadow-sm"
            >
              <svg className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={onOpenInNewTab}
              className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-[var(--gbp-accent)] px-3.5 py-2 text-xs font-bold text-white ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--gbp-accent)_70%,black)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:shadow-sm"
            >
              <span>Abrir en pestaña</span>
            </button>
            <div className="h-5 w-px bg-[var(--gbp-border)]" />
            <button
              type="button"
              onClick={onClose}
              className="group inline-flex items-center justify-center rounded-lg bg-[color:color-mix(in_oklab,var(--gbp-red)_10%,transparent)] p-2 text-[var(--gbp-red)] transition-all hover:bg-[var(--gbp-red)] hover:text-white"
              title="Cerrar modal"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 w-full bg-[var(--gbp-bg)] overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {docusealReady && !docusealLoadFailed
            ? createElement("docuseal-form", {
                "data-src": src,
                "data-email": signerEmail,
                className: "w-full min-h-full border-none",
              } as Record<string, unknown>)
            : docusealLoadFailed
              ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-6 px-8 py-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-[var(--gbp-accent)] opacity-20" />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-[var(--gbp-accent)] to-[color:color-mix(in_oklab,var(--gbp-accent)_50%,black)] text-white shadow-xl shadow-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)]">
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                  </div>
                  <div className="max-w-md space-y-3">
                    <h4 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)] text-balance">Protección de Navegador</h4>
                    <p className="text-sm leading-relaxed text-[var(--gbp-text2)] text-balance">
                      Parece que tu navegador o bloqueador de anuncios no permite incrustar de forma iframe este módulo seguro. <span className="font-semibold text-[var(--gbp-text)]">No hay problema.</span> Accede a nuestra pestaña cifrada certificada para firmarlo en una nueva ventana.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-4">
                    <a
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-[var(--gbp-accent)] to-[color:color-mix(in_oklab,var(--gbp-accent)_85%,black)] px-8 py-3.5 text-sm font-black text-white shadow-[0_8px_30px_-10px_var(--gbp-accent)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-10px_var(--gbp-accent)] active:translate-y-0 active:shadow-none"
                    >
                      <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
                      <span>Firma Segura en Nueva Pestaña</span>
                      <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </a>
                    <p className="text-xs font-medium text-[var(--gbp-muted)]">Una vez firmado con éxito, regresa y cierra esta ventana.</p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 py-12 text-center">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute h-28 w-28 animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-[var(--gbp-accent)] opacity-10 blur-xl" />
                    <div className="absolute h-20 w-20 animate-[ping_2s_ease-in-out_infinite] rounded-full border border-[var(--gbp-accent)] opacity-20" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--gbp-surface)] shadow-lg shadow-[color:color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] ring-1 ring-[var(--gbp-border2)]">
                      <svg className="h-7 w-7 animate-spin text-[var(--gbp-accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  </div>
                  <div className="space-y-1.5 animate-in slide-in-from-bottom-2 duration-700">
                    <h4 className="text-lg font-bold tracking-tight text-[var(--gbp-text)]">Creando entorno de firma</h4>
                    <p className="mx-auto max-w-[280px] text-sm font-medium leading-relaxed text-[var(--gbp-text2)]">Estableciendo túnel encriptado con la plataforma certificada de firmas. Esto tomará un instante.</p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenInNewTab}
                    className="inline-flex items-center justify-center rounded-xl bg-[var(--gbp-accent)] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--gbp-accent-hover)]"
                  >
                    Abrir firma en nueva pestaña
                  </button>
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
