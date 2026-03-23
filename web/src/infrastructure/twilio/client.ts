import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Initialize the Twilio client only if the required env vars exist
// This prevents crashes in environments where Twilio is not configured yet
export const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Sends a message using Twilio.
 * @param to The destination phone number (must include country code, e.g., +54911...).
 * @param body The text content of the message.
 * @param channel "whatsapp" or "sms".
 * @returns An object with success status and the Twilio message SID or error message.
 */
export async function sendTwilioMessage(
  to: string,
  body: string,
  channel: "whatsapp" | "sms" = "sms"
) {
  if (!twilioClient) {
    console.warn("Twilio is not configured. Message skipped.");
    return { success: false, error: "Twilio API keys not set in environment." };
  }

  try {
    const isWhatsApp = channel === "whatsapp";
    // For WhatsApp, Twilio requires the 'whatsapp:' prefix for both FROM and TO numbers
    const formattedTo = isWhatsApp && !to.startsWith("whatsapp:") ? `whatsapp:${to}` : to;
    
    // Fallback to empty string to keep Typescript happy, but will fail at Twilio's end if actually empty
    const fromPhone =
      (isWhatsApp
        ? process.env.TWILIO_WHATSAPP_NUMBER
        : process.env.TWILIO_PHONE_NUMBER) || "";

    const formattedFrom = isWhatsApp && !fromPhone.startsWith("whatsapp:") ? `whatsapp:${fromPhone}` : fromPhone;

    const message = await twilioClient.messages.create({
      body: body,
      from: formattedFrom,
      to: formattedTo,
    });

    return { success: true, messageId: message.sid };
  } catch (error: unknown) {
    console.error("Failed to send Twilio message:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
