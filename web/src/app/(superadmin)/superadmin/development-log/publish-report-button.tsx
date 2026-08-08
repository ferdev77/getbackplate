"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { publishDevelopmentReportAction } from "./actions";

export function PublishReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function publish() {
    if (!window.confirm("¿Publicar este período? Después de publicarlo no se podrán cambiar los precios.")) return;
    startTransition(async () => {
      const result = await publishDevelopmentReportAction(reportId);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Período publicado");
        router.refresh();
      }
    });
  }

  return <button type="button" disabled={pending} onClick={publish} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
    <Send className="h-4 w-4" />{pending ? "Publicando..." : "Publicar"}
  </button>;
}
