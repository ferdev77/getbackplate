export interface SendEmailOptions {
  to: { name?: string; email: string }[];
  subject: string;
  htmlContent: string;
}

export async function sendEmail({ to, subject, htmlContent }: SendEmailOptions) {
  const apiKey = process.env.BREVO_API_KEY;
  
  if (!apiKey) {
    console.error("No BREVO_API_KEY configured.");
    return { ok: false, error: "Servicio de correo no configurado (falta API Key)." };
  }

  // Fallback to a default from env or statically named fallback
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "info@getbackplate.com";
  const senderName = process.env.BREVO_SENDER_NAME || "GetBackplate";

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to,
        subject,
        htmlContent
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error from Brevo API:", errorData);
      return { ok: false, error: "Hubo un error al enviar el correo con el proveedor." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Fetch error to Brevo API:", error);
    return { ok: false, error: "Error de conexión interna al enviar correo." };
  }
}
