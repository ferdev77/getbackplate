"use client";

import { useState } from "react";

type DocumentSummary = {
  id: string;
  title: string;
};

type Props = {
  document: DocumentSummary;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: { documentId: string; email: string; message: string }) => void;
};

const MODAL_PANEL = "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]";
const MODAL_HEADER = "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5";
const MODAL_TITLE = "font-serif text-[15px] font-bold text-[var(--gbp-text)]";
const MODAL_CLOSE = "grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-bg)]";
const MODAL_SOFT_BOX = "rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3";
const MODAL_LABEL = "text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-text2)] uppercase";
const MODAL_INPUT = "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]";
const MODAL_FOOTER = "flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";
const MODAL_CANCEL = "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const MODAL_PRIMARY = "rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-60";

export function DocumentShareByEmailModal({ document, busy, onCancel, onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/45 p-5" onClick={() => !busy && onCancel()}>
      <div className={`w-[460px] max-w-[95vw] ${MODAL_PANEL}`} onClick={(event) => event.stopPropagation()}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>Compartir por email</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <div className="space-y-3 px-6 py-5">
          <div className={MODAL_SOFT_BOX}>
            <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--gbp-text2)] uppercase">Documento</p>
            <p className="text-sm font-semibold text-[var(--gbp-text)]">{document.title}</p>
          </div>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Email destino</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="usuario@empresa.com" className={MODAL_INPUT} /></label>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Mensaje (opcional)</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className={MODAL_INPUT} placeholder="Te comparto este archivo." /></label>
        </div>
        <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="button" disabled={busy || !email.trim()} onClick={() => onSubmit({ documentId: document.id, email: email.trim(), message: message.trim() })} className={MODAL_PRIMARY}>{busy ? "Enviando..." : "Enviar"}</button></div>
      </div>
    </div>
  );
}
