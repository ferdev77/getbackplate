"use client";

import { useState } from "react";

import { SubmitButton } from "@/shared/ui/submit-button";
import {
  ScopeModalField,
  ScopeModalDialog,
  ScopeModalHeader,
  SCOPE_MODAL_CANCEL,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_PANEL_COMPACT,
  SCOPE_MODAL_TEXTAREA,
} from "@/shared/ui/scope-modal-layout";

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

/**
 * Este modal no elige audiencia: manda el documento a una direccion escrita a
 * mano. Por eso queda fuera del layout de tres columnas y usa el panel compacto,
 * pero comparte los campos, el encabezado y el pie con el resto.
 */
export function DocumentShareByEmailModal({ document, busy, onCancel, onSubmit }: Props) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  return (
    <ScopeModalDialog
      onClose={onCancel}
      closeOnBackdrop
      canClose={!busy}
      overlayClassName="fixed inset-0 z-[1060] flex items-center justify-center bg-black/45 p-5"
      panelClassName={`w-[460px] max-w-full ${SCOPE_MODAL_PANEL_COMPACT}`}
    >
      <ScopeModalHeader title="Compartir por email" subtitle={document.title} onClose={onCancel} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          onSubmit({ documentId: document.id, email: email.trim(), message: message.trim() });
        }}
      >
          <div className="flex flex-col gap-3 px-6 py-5">
            <ScopeModalField label="Email destino">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="usuario@empresa.com"
                className={SCOPE_MODAL_INPUT}
                data-modal-initial-focus
              />
            </ScopeModalField>

            <ScopeModalField label="Mensaje (opcional)">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Te comparto este archivo."
                className={SCOPE_MODAL_TEXTAREA}
              />
            </ScopeModalField>
          </div>

          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={onCancel} disabled={busy} className={`${SCOPE_MODAL_CANCEL} disabled:cursor-not-allowed disabled:opacity-50`}>
              Cancelar
            </button>
            <SubmitButton
              label="Enviar"
              pendingLabel="Enviando..."
              pending={busy}
              disabled={!email.trim()}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
      </form>
    </ScopeModalDialog>
  );
}
