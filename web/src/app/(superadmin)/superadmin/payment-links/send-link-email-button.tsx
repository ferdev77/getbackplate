"use client";

import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Mail, MailCheck, Loader2, X } from "lucide-react";

type SendResult = { ok: boolean; error?: string };

type Props = {
  orderId: string;
  sentTo: string | null;
  action: (formData: FormData) => Promise<SendResult>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SendLinkEmailButton({ orderId, sentTo, action }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(sentTo ?? "");
  const [lastSentTo, setLastSentTo] = useState(sentTo);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  function send() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast.error("Email inválido");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("order_id", orderId);
      formData.set("email", trimmed);
      const result = await action(formData);
      if (result.ok) {
        toast.success(`Link enviado a ${trimmed}`);
        setLastSentTo(trimmed);
        setOpen(false);
      } else {
        toast.error(result.error ?? "No se pudo enviar el email");
      }
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={lastSentTo ? `Sent to ${lastSentTo}` : "Enviar por email"}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
          lastSentTo
            ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
        }`}
      >
        {lastSentTo ? <MailCheck className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Enviar link</span>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="email"
              autoFocus
              value={email}
              disabled={pending}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
              placeholder="Email"
              className="w-full rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--gbp-accent)]"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-[var(--gbp-border)] py-1.5 text-[11px] font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--gbp-accent)] py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
