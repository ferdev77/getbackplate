import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { escapeSupportText, supportRequestSchema } from "@/modules/support/support-request";
import { applySharedRateLimit } from "@/shared/lib/ai-runtime-store";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";

function visitorAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function visitorHash(value: string) {
  const secret = process.env.QBO_OAUTH_STATE_SECRET?.trim();
  if (!secret) throw new Error("Support visitor hash secret is not configured");
  return createHmac("sha256", secret).update("support-visitor\0").update(value).digest("hex");
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = supportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  // Bots commonly populate this hidden field. Return success without persisting.
  if (parsed.data.website) return NextResponse.json({ ok: true });

  const ip = visitorAddress(request);
  const email = parsed.data.email.toLowerCase();
  const ipHash = visitorHash(ip);
  const [ipAllowed, emailAllowed] = await Promise.all([
    applySharedRateLimit({ userId: `support-ip:${ip}`, windowMs: 60 * 60 * 1000, maxRequests: 5 }),
    applySharedRateLimit({ userId: `support-email:${email}`, windowMs: 24 * 60 * 60 * 1000, maxRequests: 3 }),
  ]);
  if (ipAllowed === false || emailAllowed === false) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [ipCount, emailCount] = await Promise.all([
    admin.from("support_requests").select("id", { count: "exact", head: true }).eq("visitor_ip_hash", ipHash).gte("created_at", oneHourAgo),
    admin.from("support_requests").select("id", { count: "exact", head: true }).eq("requester_email", email).gte("created_at", oneDayAgo),
  ]);
  if (ipCount.error || emailCount.error) {
    console.error("Unable to enforce support request rate limit", ipCount.error ?? emailCount.error);
    return NextResponse.json({ error: "Support is temporarily unavailable." }, { status: 503 });
  }
  if ((ipCount.count ?? 0) >= 5 || (emailCount.count ?? 0) >= 3) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { data: created, error } = await admin
    .from("support_requests")
    .insert({
      request_type: parsed.data.requestType,
      requester_name: parsed.data.name,
      requester_email: email,
      company_name: parsed.data.company || null,
      details: parsed.data.details,
      visitor_ip_hash: ipHash,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Unable to persist support request", error);
    return NextResponse.json({ error: "Unable to submit your request." }, { status: 500 });
  }

  const safeName = escapeSupportText(parsed.data.name);
  const safeEmail = escapeSupportText(parsed.data.email);
  const safeCompany = escapeSupportText(parsed.data.company || "Not provided");
  const safeDetails = escapeSupportText(parsed.data.details).replaceAll("\n", "<br />");
  const internalEmail = process.env.PRIVACY_SUPPORT_EMAIL?.trim() || "support@getbackplate.com";

  const [acknowledgement, internalNotice] = await Promise.all([
    sendTransactionalEmail({
      to: parsed.data.email,
      subject: `We received your GetBackplate ${parsed.data.requestType} request`,
      html: `<p>Hello ${safeName},</p><p>We received your request and assigned reference <strong>${created.id}</strong>.</p><p>Privacy and data requests require identity and authority verification before we take action. We will follow up by email. Fiscal and billing records may be retained where legally required.</p><p>GetBackplate Support<br />${COMPANY_ADDRESS.inline}</p>`,
      text: `We received your request. Reference: ${created.id}. We will follow up by email after any required identity verification.\n\nGetBackplate Support\n${COMPANY_ADDRESS.inline}`,
      notification: { source: "public_support_acknowledgement", sourceId: created.id },
    }),
    sendTransactionalEmail({
      to: internalEmail,
      subject: `[${parsed.data.requestType.toUpperCase()}] Public support request ${created.id}`,
      html: `<p><strong>Reference:</strong> ${created.id}</p><p><strong>Name:</strong> ${safeName}<br /><strong>Email:</strong> ${safeEmail}<br /><strong>Company:</strong> ${safeCompany}<br /><strong>Type:</strong> ${parsed.data.requestType}</p><p><strong>Details</strong><br />${safeDetails}</p><p>${COMPANY_ADDRESS.inline}</p>`,
      text: `A new ${parsed.data.requestType} request was recorded. Reference: ${created.id}. Review it in the support_requests table.\n\n${COMPANY_ADDRESS.inline}`,
      notification: { source: "public_support_internal", sourceId: created.id },
    }),
  ]);

  if (!acknowledgement.ok || !internalNotice.ok) {
    console.error("Support request email delivery failed", {
      acknowledgement: acknowledgement.ok ? null : acknowledgement.error,
      internal: internalNotice.ok ? null : internalNotice.error,
      requestId: created.id,
    });
  }

  const notificationErrors = [acknowledgement, internalNotice]
    .filter((result) => !result.ok)
    .map((result) => result.error)
    .filter((value): value is string => Boolean(value));
  const { error: notificationStatusError } = await admin
    .from("support_requests")
    .update({
      acknowledgement_sent_at: acknowledgement.ok ? new Date().toISOString() : null,
      internal_notified_at: internalNotice.ok ? new Date().toISOString() : null,
      notification_error: notificationErrors.length > 0 ? notificationErrors.join("; ").slice(0, 2000) : null,
    })
    .eq("id", created.id);
  if (notificationStatusError) {
    console.error("Unable to record support notification status", notificationStatusError);
  }

  return NextResponse.json({
    ok: true,
    reference: created.id,
    message: "Your request was recorded. Keep this reference for future communication.",
  });
}
