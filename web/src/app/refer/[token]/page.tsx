import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { verifyReferralToken } from "@/modules/integrations/qbo-r365/services/referral-token";
import { ReferralFormClient } from "./referral-form-client";

export const metadata: Metadata = {
  title: "Refer a vendor · GetBackplate",
  description:
    "Refer a vendor still sending invoices as PDFs and we'll automate their delivery to your Restaurant365.",
};

type Props = { params: Promise<{ token: string }> };

async function resolveReferrer(token: string): Promise<{ branchName: string } | null> {
  try {
    const { organizationId, syncConfigCustomerId } = verifyReferralToken(token);
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("qbo_r365_sync_config_customers")
      .select("qbo_customer_name, organization_id")
      .eq("id", syncConfigCustomerId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!data) return null;
    return { branchName: data.qbo_customer_name as string };
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ReferPage({ params }: Props) {
  const { token } = await params;
  const referrer = await resolveReferrer(token);

  if (!referrer) notFound();

  const { branchName } = referrer;
  const initials = getInitials(branchName);

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      fontSize: 16,
      lineHeight: 1.6,
      color: "#14151A",
      background: "#F7F8FC",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>

      <nav style={{
        borderBottom: "1px solid #E6E8EE",
        background: "#FFFFFF",
      }}>
        <div style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
        }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#14151A", letterSpacing: "-0.01em" }}>
            GetBackplate<span style={{ color: "#D4531A" }}>.</span>
          </span>
          <div style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500 }}>
            <a href="/legal/" style={{ color: "#595B66", textDecoration: "none" }}>Legal</a>
            <a href="/trust/" style={{ color: "#595B66", textDecoration: "none" }}>Trust</a>
          </div>
        </div>
      </nav>

      <main style={{ flex: 1, padding: "56px 0" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px" }}>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#D4531A",
            marginBottom: 20,
          }}>
            <span style={{ width: 6, height: 6, background: "#D4531A", borderRadius: "50%", display: "inline-block" }} />
            Referral
          </div>

          <h1 style={{
            fontSize: "clamp(28px, 5vw, 36px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            marginBottom: 32,
            color: "#14151A",
          }}>
            Refer a vendor and save hundreds of hours of manual entry.
          </h1>

          <ReferralFormClient token={token} referrerName={branchName} referrerInitials={initials} />

          <p style={{
            marginTop: 16,
            fontSize: 12,
            color: "#8A8C95",
            lineHeight: 1.5,
            textAlign: "center",
          }}>
            We'll send them an email introducing GetBackplate on your behalf.
          </p>

        </div>
      </main>

      <footer style={{ background: "#14151A", color: "#8A8C95", padding: "28px 0" }}>
        <div style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          gap: 16,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#D4531A", fontWeight: 700, fontSize: 18 }}>[</span>
            <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>GetBackplate</span>
            <span style={{ color: "#D4531A", fontWeight: 700, fontSize: 18 }}>]</span>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            <a href="/trust/" style={{ color: "#8A8C95", textDecoration: "none" }}>Trust</a>
            <span style={{ margin: "0 8px" }}>·</span>
            <a href="mailto:angelo@getbackplate.com" style={{ color: "#8A8C95", textDecoration: "none" }}>Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
