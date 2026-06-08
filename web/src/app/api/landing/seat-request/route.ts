import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";

function getLogoUrl() {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "");
  return `${base}/getbackplate-logo-light.svg`;
}

function buildHtml(p: {
  name: string;
  email: string;
  phone: string;
  state: string;
  restaurant: string;
  locations: string;
  planName: string;
}) {
  const fields = [
    { label: "Restaurant", value: p.restaurant },
    { label: "State", value: p.state },
    { label: "Locations", value: p.locations },
    { label: "Phone", value: p.phone || "—" },
  ];

  const rows = fields
    .map(
      (f) => `
      <tr>
        <td style="padding:10px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#9CA3AF;white-space:nowrap;width:130px">${f.label}</td>
        <td style="padding:10px 20px 10px 0;font-size:14px;font-weight:600;color:#111827">${f.value}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

        <!-- Header -->
        <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:28px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <img src="${getLogoUrl()}" alt="GetBackplate" style="height:32px;width:auto;display:block;" />
              </td>
              <td align="right">
                <span style="display:inline-block;background:#D4531A;color:#FFFFFF;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:4px 10px;border-radius:100px">First Table Program</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Hero band -->
        <tr><td style="background:#D4531A;padding:20px 32px">
          <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.7)">New seat request · ${p.planName} plan</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em">${p.name}</p>
          <a href="mailto:${p.email}" style="display:inline-block;margin-top:4px;font-size:13px;color:rgba(255,255,255,0.85);text-decoration:none">${p.email}</a>
        </td></tr>

        <!-- Data card -->
        <tr><td style="background:#FFFFFF;padding:0">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rows}
          </table>
        </td></tr>

        <!-- Divider -->
        <tr><td style="background:#FFFFFF;padding:0 20px">
          <div style="border-top:1px solid #F3F4F6"></div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:20px 32px 28px">
          <a href="mailto:${p.email}?subject=Re: Your GetBackplate seat request&body=Hi ${p.name},"
             style="display:inline-block;background:#111827;color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px">
            Reply to ${p.name} →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 8px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#9CA3AF">
            Sent automatically from <a href="https://getbackplate.com" style="color:#9CA3AF">getbackplate.com</a> — landing page seat request form.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { name, email, phone, state, restaurant, locations, toEmail, planName } = body as Record<string, string>;

  if (!name || !email || !restaurant || !state || !locations || !toEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await sendTransactionalEmail({
    to: toEmail,
    subject: `Seat Request — ${restaurant} (${state})`,
    html: buildHtml({ name, email, phone, state, restaurant, locations, planName: planName ?? "GetBackplate" }),
    text: `New seat request\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\nState: ${state}\nRestaurant: ${restaurant}\nLocations: ${locations}\nPlan: ${planName}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
