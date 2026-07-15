import { NextResponse } from "next/server";
import { applySharedRateLimit } from "@/shared/lib/ai-runtime-store";
import { isValidEmail } from "@/shared/lib/validate-email";
import { sendPublicVendorReferral } from "@/modules/integrations/qbo-r365/services/vendor-referral.service";

const IP_WINDOW_MS = 24 * 60 * 60 * 1000;
const IP_MAX_REQUESTS = 3;
const VENDOR_EMAIL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const VENDOR_EMAIL_MAX_REQUESTS = 1;

type PublicReferralBody = {
  referrerName: string;
  referrerEmail: string;
  vendorCompany: string;
  vendorContactName: string;
  vendorEmail: string;
};

export async function POST(request: Request) {
  let body: PublicReferralBody;
  try {
    body = (await request.json()) as PublicReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { referrerName, referrerEmail, vendorCompany, vendorContactName, vendorEmail } = body;

  if (!referrerName?.trim() || !referrerEmail?.trim() || !vendorCompany?.trim() || !vendorContactName?.trim() || !vendorEmail?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (referrerName.trim().length > 200 || vendorCompany.trim().length > 200 || vendorContactName.trim().length > 200) {
    return NextResponse.json({ error: "Input too long" }, { status: 400 });
  }

  if (!isValidEmail(referrerEmail.trim()) || !isValidEmail(vendorEmail.trim())) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) ?? realIp ?? "127.0.0.1";
  const vendorEmailNormalized = vendorEmail.trim().toLowerCase();

  const ipAllowed = await applySharedRateLimit({
    userId: `refer-public-ip:${ip}`,
    windowMs: IP_WINDOW_MS,
    maxRequests: IP_MAX_REQUESTS,
  });
  if (ipAllowed === false) {
    return NextResponse.json(
      { error: "You've reached today's referral limit. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const vendorAllowed = await applySharedRateLimit({
    userId: `refer-public-vendor-email:${vendorEmailNormalized}`,
    windowMs: VENDOR_EMAIL_WINDOW_MS,
    maxRequests: VENDOR_EMAIL_MAX_REQUESTS,
  });
  if (vendorAllowed === false) {
    // Este vendor ya fue referido recientemente. Respuesta de exito silenciosa
    // a proposito: no confirmamos ni negamos el estado de un tercero al visitante.
    return NextResponse.json({ ok: true });
  }

  try {
    await sendPublicVendorReferral({
      referrerName: referrerName.trim(),
      referrerEmail: referrerEmail.trim().toLowerCase(),
      vendorCompany: vendorCompany.trim(),
      vendorContactName: vendorContactName.trim(),
      vendorEmail: vendorEmailNormalized,
      visitorIp: ip,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send referral";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
