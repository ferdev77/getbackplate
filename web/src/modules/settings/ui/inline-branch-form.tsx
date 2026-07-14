"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";
import { createTranslator } from "./settings.i18n";

function SubmitButton({ t }: { t: (s: string) => string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--gbp-text)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-50"
    >
      {pending ? t("Guardando...") : t("Guardar locación")}
    </button>
  );
}

export function InlineBranchForm({
  locale,
  createAction,
}: {
  locale?: "es" | "en";
  createAction: (formData: FormData) => Promise<void>;
}) {
  const t = createTranslator(locale);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
      >
        <Plus className="h-3.5 w-3.5" /> {t("Agregar")}
      </button>
    );
  }

  return (
    <div className="mt-3 mb-4 w-full animate-in overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 shadow-sm fade-in slide-in-from-top-2">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--gbp-text)]">{t("Nueva Locación")}</p>
        <button
          onClick={() => setOpen(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
        >
          ✕
        </button>
      </div>
      <form
        ref={formRef}
        action={async (formData) => {
          await createAction(formData);
          setOpen(false);
          formRef.current?.reset();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <input name="name" required placeholder={t("Nombre de locación")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        <input name="city" placeholder={t("Ciudad (opcional)")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        <input name="state" placeholder={t("Provincia / Estado (opcional)")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        <input name="country" placeholder={t("País (opcional)")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        <input name="phone" placeholder={t("Teléfono (opcional)")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)] sm:col-span-2" />
        <input name="address" placeholder={t("Dirección completa (opcional)")} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)] sm:col-span-2" />

        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
          >
            {t("Cancelar")}
          </button>
          <SubmitButton t={t} />
        </div>
      </form>
    </div>
  );
}
