"use client";

import { useTransition } from "react";
import { CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { updateFeedbackStatusAction } from "./actions";

interface Props {
  id: string;
  isResolved: boolean;
}

export function FeedbackStatusButton({ id, isResolved }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const newStatus = isResolved ? "open" : "resolved";
    startTransition(async () => {
      await updateFeedbackStatusAction(id, newStatus);
    });
  }

  if (isResolved) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-60"
      >
        {isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Reabriendo...</>
        ) : (
          <><RefreshCw className="h-4 w-4" /> Reabrir</>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-xs font-bold text-white shadow-lg shadow-black/10 transition-all hover:bg-black disabled:opacity-60"
    >
      {isPending ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Marcando...</>
      ) : (
        <><CheckCircle2 className="h-4 w-4" /> Marcar Resuelto</>
      )}
    </button>
  );
}
