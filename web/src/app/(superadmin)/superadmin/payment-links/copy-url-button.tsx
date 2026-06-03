"use client";

import { useState } from "react";
import { Copy, CheckCheck } from "lucide-react";

export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar link"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-600"
          : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
      }`}
    >
      {copied ? <><CheckCheck className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
    </button>
  );
}
