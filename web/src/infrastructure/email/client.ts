import { logNotificationsBulk, resolveUserIdByEmail, type LogNotificationInput } from "@/infrastructure/notifications/log-notification";

type SendEmailNotificationMeta = {
  source: string;
  userId?: string | null;
  organizationId?: string | null;
  actionUrl?: string | null;
  title?: string;
  sourceId?: string | null;
  createdBy?: string | null;
};

type SendEmailInput = {
  to: string;
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
  notification: SendEmailNotificationMeta;
  attachmentUrl?: string;
  attachmentName?: string;
};

type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string };

function getSender(overrideSenderName?: string) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || process.env.MAIL_FROM?.trim();
  const senderName = overrideSenderName?.trim() || process.env.BREVO_SENDER_NAME?.trim() || "GetBackplate";
  return { senderEmail, senderName };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const BREVO_TIMEOUT_MS = 20_000;

// Brevo's url-based attachment only accepts links that literally end in a
// known file extension (e.g. ".pdf") -- Stripe's invoice_pdf links end in
// "/pdf?s=..." and get rejected. Downloading the bytes ourselves and sending
// them as base64 content sidesteps that URL-format restriction entirely.
async function fetchAttachmentAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(BREVO_TIMEOUT_MS) });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch {
    return null;
  }
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const { senderEmail, senderName } = getSender(input.senderName);

  let result: SendEmailResult;

  if (!apiKey) {
    result = { ok: false, error: "BREVO_API_KEY is not configured" };
  } else if (!senderEmail) {
    result = { ok: false, error: "BREVO_SENDER_EMAIL/MAIL_FROM is not configured" };
  } else {
    try {
      const attachmentContent = input.attachmentUrl
        ? await fetchAttachmentAsBase64(input.attachmentUrl)
        : null;

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: input.to }],
          bcc: input.bcc?.map((email) => ({ email })),
          subject: input.subject,
          htmlContent: input.html,
          textContent: input.text,
          attachment: attachmentContent
            ? [{ content: attachmentContent, name: input.attachmentName ?? "invoice.pdf" }]
            : undefined,
        }),
        signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        result = {
          ok: false,
          error: `Brevo error ${response.status}: ${bodyText || "request failed"}`,
        };
      } else {
        result = { ok: true };
      }
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? `Brevo request failed: ${error.message}` : "Brevo request failed",
      };
    }
  }

  // userId === undefined: el call-site no lo sabe, se intenta resolver por email.
  // userId === null: el call-site decidio explicitamente no resolverlo (ej:
  // destinatario externo sin cuenta, como landing_seat_request).
  const resolvedUserId = input.notification.userId !== undefined
    ? input.notification.userId
    : await resolveUserIdByEmail(input.to);

  const baseRow = {
    organizationId: input.notification.organizationId ?? null,
    title: input.notification.title ?? input.subject,
    body: (input.text ?? stripHtml(input.html)).slice(0, 280),
    actionUrl: input.notification.actionUrl ?? null,
    source: input.notification.source,
    sourceId: input.notification.sourceId ?? null,
    createdBy: input.notification.createdBy ?? null,
  };

  const rows: LogNotificationInput[] = [
    {
      ...baseRow,
      channel: "email",
      userId: resolvedUserId,
      recipientEmail: input.to,
      status: result.ok ? "sent" : "failed",
    },
  ];

  // channel:'in_app' es el registro garantizado en la campanita -- se escribe
  // siempre que el destinatario tenga cuenta real, sin importar si el envio
  // del email en si funciono o no (el email es el mecanismo de entrega, no la
  // fuente de verdad de "esto te tenia que llegar").
  if (resolvedUserId) {
    rows.push({ ...baseRow, channel: "in_app", userId: resolvedUserId, status: "sent" });
  }

  void logNotificationsBulk(rows);

  return result;
}
