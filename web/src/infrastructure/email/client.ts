import { logNotification } from "@/infrastructure/notifications/log-notification";

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
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
  notification: SendEmailNotificationMeta;
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

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const { senderEmail, senderName } = getSender(input.senderName);

  let result: SendEmailResult;

  if (!apiKey) {
    result = { ok: false, error: "BREVO_API_KEY no configurada" };
  } else if (!senderEmail) {
    result = { ok: false, error: "BREVO_SENDER_EMAIL/MAIL_FROM no configurado" };
  } else {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
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
  }

  void logNotification({
    channel: "email",
    userId: input.notification.userId,
    organizationId: input.notification.organizationId ?? null,
    title: input.notification.title ?? input.subject,
    body: (input.text ?? stripHtml(input.html)).slice(0, 280),
    actionUrl: input.notification.actionUrl ?? null,
    source: input.notification.source,
    sourceId: input.notification.sourceId ?? null,
    recipientEmail: input.to,
    status: result.ok ? "sent" : "failed",
    createdBy: input.notification.createdBy ?? null,
  });

  return result;
}
