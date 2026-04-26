import { sendTransactionalEmail } from "@/infrastructure/email/client";

export interface SendEmailOptions {
  to: { name?: string; email: string }[];
  subject: string;
  htmlContent: string;
  senderName?: string;
}

export async function sendEmail({ to, subject, htmlContent, senderName }: SendEmailOptions) {
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
