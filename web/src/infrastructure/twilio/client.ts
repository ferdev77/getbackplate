import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Initialize the Twilio client only if the required env vars exist
// This prevents crashes in environments where Twilio is not configured yet
export const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

function normalizeRawPhone(value: string) {
  return value.replace(/[^0-9+]/g, "").trim();
}

function toWhatsAppAddress(phone: string) {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

function normalizeArgentineFormat(phone: string, channel: "whatsapp" | "sms") {
  const normalized = normalizeRawPhone(phone);

  if (!normalized.startsWith("+54")) {
    return normalized;
  }

  const rest = normalized.slice(3);
  if (!rest) {
    return normalized;
  }

  if (channel === "sms") {
    return rest.startsWith("9") ? `+54${rest.slice(1)}` : normalized;
  }

  return rest.startsWith("9") ? normalized : `+549${rest}`;
}

function resolveTwilioTargets(to: string, channel: "whatsapp" | "sms") {
  const base = normalizeRawPhone(to);
  const trialMode = process.env.TWILIO_TRIAL_MODE === "true";

  if (!trialMode) {
    return [base];
  }

  const preferred = normalizeArgentineFormat(base, channel);
  const fallback = preferred === base ? normalizeArgentineFormat(base, channel === "sms" ? "whatsapp" : "sms") : base;

  return fallback && fallback !== preferred ? [preferred, fallback] : [preferred];
}

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
    const targetNumbers = resolveTwilioTargets(to, channel);
    
    // Fallback to empty string to keep Typescript happy, but will fail at Twilio's end if actually empty
    const fromPhone =
      (isWhatsApp
        ? process.env.TWILIO_WHATSAPP_NUMBER
        : process.env.TWILIO_PHONE_NUMBER) || "";

    const formattedFrom = isWhatsApp && !fromPhone.startsWith("whatsapp:") ? `whatsapp:${fromPhone}` : fromPhone;

    let lastError: unknown = null;

    for (const target of targetNumbers) {
      try {
        const message = await twilioClient.messages.create({
          body,
          from: formattedFrom,
          to: isWhatsApp ? toWhatsAppAddress(target) : target,
        });

        return { success: true, messageId: message.sid };
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  } catch (error: unknown) {
    console.error("Failed to send Twilio message:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
