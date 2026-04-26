type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
};

type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string };

function getSender(overrideSenderName?: string) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || process.env.MAIL_FROM?.trim();
  const senderName = overrideSenderName?.trim() || process.env.BREVO_SENDER_NAME?.trim() || "GetBackplate";
  return { senderEmail, senderName };
}

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const { senderEmail, senderName } = getSender(input.senderName);

  if (!apiKey) {
    return { ok: false, error: "BREVO_API_KEY no configurada" };
  }

  if (!senderEmail) {
    return { ok: false, error: "BREVO_SENDER_EMAIL/MAIL_FROM no configurado" };
  }

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
    return {
      ok: false,
      error: `Brevo error ${response.status}: ${bodyText || "request failed"}`,
    };
  }

  return { ok: true };
}
