"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Mail, MailCheck, Send, Loader2, X } from "lucide-react";

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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={lastSentTo ? `Sent to ${lastSentTo}` : "Enviar por email"}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
          lastSentTo
            ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
        }`}
      >
        {lastSentTo ? <MailCheck className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="inline-flex items-center gap-1"
    >
      <input
        type="email"
        autoFocus
        value={email}
        disabled={pending}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); send(); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Email"
        className="w-36 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[var(--gbp-accent)]"
      />
      <button
        type="button"
        onClick={send}
        disabled={pending}
        title="Send"
        className="inline-flex items-center justify-center rounded-lg bg-[var(--gbp-accent)] p-1.5 text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        title="Cancel"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--gbp-border)] p-1.5 text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)]"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}
