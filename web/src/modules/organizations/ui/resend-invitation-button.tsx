"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

type ResendInvitationButtonProps = {
  organizationId: string;
  email: string;
  fullName: string;
};

type RequestResult = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export function ResendInvitationButton({ organizationId, email, fullName }: ResendInvitationButtonProps) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleResend() {
    if (pending) return;

    setPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/superadmin/organizations/invitations/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          email,
          fullName,
        }),
      });

      const payload = (await response.json().catch(() => null)) as RequestResult | null;
      const baseMessage = payload?.message ?? payload?.error ?? "Unable to resend the invitation";
      const message =
        response.status === 404
          ? `${baseMessage} You must create or assign the administrator before sending a reminder.`
          : baseMessage;

      if (!response.ok || payload?.ok === false) {
        setResult({ type: "error", message });
        return;
      }

      setResult({ type: "success", message });
    } catch {
      setResult({ type: "error", message: "Unable to resend the invitation. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleResend}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand bg-white px-3 py-2 text-xs font-bold text-brand transition hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Resending...
          </>
        ) : (
          "Resend invitation"
        )}
      </button>
      {result ? (
        <p
          className={`mt-2 text-[11px] font-semibold ${
            result.type === "success" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
