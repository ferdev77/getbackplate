import { sendTransactionalEmail } from "@/infrastructure/email/client";

export interface SendEmailOptions {
  to: { name?: string; email: string }[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  notification: {
    source: string;
    /**
     * Solo para cuando el llamador ya sabe que este destinatario va a recibir
     * (o ya recibio) su propia fila en la campanita por otro canal -- pasar
     * `null` evita que se duplique. Sin este campo, se resuelve por email como
     * siempre.
     */
    userId?: string | null;
    organizationId?: string | null;
    actionUrl?: string | null;
    sourceId?: string | null;
  };
}

export async function sendEmail({ to, subject, htmlContent, senderName, notification }: SendEmailOptions) {
  if (!to.length) {
    return { ok: false, error: "No hay destinatarios para enviar el correo." };
  }

  let firstError: string | null = null;

  for (const recipient of to) {
    const result = await sendTransactionalEmail({
      to: recipient.email,
      subject,
      html: htmlContent,
      senderName,
      notification: {
        source: notification.source,
        userId: notification.userId,
        organizationId: notification.organizationId ?? null,
        actionUrl: notification.actionUrl ?? null,
        sourceId: notification.sourceId ?? null,
      },
    });

    if (!result.ok && !firstError) {
      firstError = result.error;
    }
  }

  if (firstError) {
    return { ok: false, error: firstError };
  }

  return { ok: true };
}
