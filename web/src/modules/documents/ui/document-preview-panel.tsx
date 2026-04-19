"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

type PreviewDoc = {
  id: string;
  title: string;
  mime_type: string | null;
};

type PreviewState = {
  docId: string | null;
  status: "idle" | "loading" | "ready" | "error";
};

export function DocumentPreviewPanel({
  document,
  previewState,
  setPreviewState,
  isPreviewableMime,
}: {
  document: PreviewDoc;
  previewState: PreviewState;
  setPreviewState: (next: PreviewState) => void;
  isPreviewableMime: (mimeType: string | null) => boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={document.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {document.mime_type?.startsWith("image/") ? (
            <Image
              src={`/api/documents/preview?documentId=${encodeURIComponent(document.id)}`}
              alt={`Vista previa ${document.title}`}
              width={1200}
              height={900}
              unoptimized
              className="h-[clamp(260px,42vh,420px)] w-full object-contain bg-white"
              onLoad={() => setPreviewState({ docId: document.id, status: "ready" })}
              onError={() => setPreviewState({ docId: document.id, status: "error" })}
            />
          ) : isPreviewableMime(document.mime_type) ? (
            <iframe
              src={`/api/documents/preview?documentId=${encodeURIComponent(document.id)}`}
              title={`Vista previa ${document.title}`}
              className="h-[clamp(260px,42vh,420px)] w-full bg-white"
              onLoad={() => setPreviewState({ docId: document.id, status: "ready" })}
            />
          ) : (
            <div className="grid h-[240px] place-items-center p-4 text-center text-sm text-[var(--gbp-text2)]">
              Este formato no tiene previsualizacion embebida. Usa Ver o Descargar.
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {previewState.docId !== document.id || previewState.status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[color:color-mix(in_oklab,var(--gbp-surface)_82%,transparent)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbp-border2)] border-t-[var(--gbp-accent)]" />
        </div>
      ) : null}
      {previewState.docId === document.id && previewState.status === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-[color:color-mix(in_oklab,var(--gbp-surface)_90%,transparent)] p-4 text-center text-sm text-[var(--gbp-text2)]">
          No se pudo cargar la vista previa. Intenta con Ver o Descargar.
        </div>
      ) : null}
    </div>
  );
}
