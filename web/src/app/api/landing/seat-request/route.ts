import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { name, email, phone, state, restaurant, locations, toEmail, planName } = body as Record<string, string>;

  if (!name || !email || !restaurant || !state || !locations || !toEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const html = `
    <h2 style="font-family:sans-serif;color:#111827">New Seat Request — ${planName ?? "GetBackplate"}</h2>
    <table style="font-family:sans-serif;font-size:14px;color:#374151;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">Full Name</td><td>${name}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">Phone</td><td>${phone || "—"}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">State</td><td>${state}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">Restaurant</td><td>${restaurant}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:600">Locations</td><td>${locations}</td></tr>
    </table>
    <hr style="margin:20px 0;border:none;border-top:1px solid #E5E7EB">
    <p style="font-family:sans-serif;font-size:12px;color:#9CA3AF">Sent from getbackplate.com — landing page seat request form.</p>
  `;

  const result = await sendTransactionalEmail({
    to: toEmail,
    subject: `Seat Request — ${restaurant} (${state})`,
    html,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\nState: ${state}\nRestaurant: ${restaurant}\nLocations: ${locations}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
