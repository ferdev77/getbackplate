"use client";

import { useEffect, useState, useTransition } from "react";
import { resendMfaCodeAction } from "@/modules/auth/mfa-actions";

export function MfaResendButton({ initialCooldownSeconds }: { initialCooldownSeconds: number }) {
  const [secondsLeft, setSecondsLeft] = useState(initialCooldownSeconds);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  function resend() {
    startTransition(async () => {
      const result = await resendMfaCodeAction();
      if (!result.ok) {
        setMessage(result.error ?? "Could not send a new code.");
        if (result.retryAfterSeconds) setSecondsLeft(result.retryAfterSeconds);
        return;
      }
      setMessage("We sent a new verification code.");
      setSecondsLeft(result.retryAfterSeconds ?? 45);
    });
  }

  return (
    <div className="mt-3 text-center">
      {message && <p className="mb-2 text-xs text-neutral-600">{message}</p>}
      <button type="button" onClick={resend} disabled={isPending || secondsLeft > 0} className="text-sm font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline">
        {isPending ? "Sending..." : secondsLeft > 0 ? `Resend code in 00:${String(secondsLeft).padStart(2, "0")}` : "Resend code"}
      </button>
    </div>
  );
}
