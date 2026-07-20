import { PublicReferralFormClient } from "./public-referral-form-client";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";

export const metadata = {
  title: "Refer a vendor · GetBackplate",
  description:
    "Refer a vendor still sending invoices as PDFs and we'll automate their delivery to your Restaurant365.",
};

export default function PublicReferPage() {
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
          <a href="https://app.getbackplate.com" style={{ display: "inline-flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/getbackplate-logo-light.svg" alt="GetBackplate" style={{ height: 32, width: "auto" }} />
          </a>
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

          <PublicReferralFormClient />

          <p style={{
            marginTop: 16,
            fontSize: 12,
            color: "#8A8C95",
            lineHeight: 1.5,
            textAlign: "center",
          }}>
            We&apos;ll send them an email introducing GetBackplate on your behalf.
          </p>

        </div>
      </main>

      <footer style={{ background: "#13161e", color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          alignItems: "center",
          gap: 12,
        }}>
          <p style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/getbackplate-logo-footer.svg" alt="GetBackplate" style={{ height: 22, width: "auto" }} />
          </p>
          <p style={{ margin: 0, textAlign: "center", fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.6)" }}>
            Run your restaurant. Not just your register.
          </p>
          <p style={{ margin: 0, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
            © 2026 GetBackplate. All rights reserved.<br />
            {COMPANY_ADDRESS.inline}<br />
            Site by <a href="https://marketingsolutions.formstack.com/forms/webform" target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b35", textDecoration: "none" }}>Marketing Solutions</a>
            {" · "}
            <a href="/legal/" style={{ textDecoration: "underline", textUnderlineOffset: 2, color: "rgba(255,255,255,0.5)" }}>Legal</a>
          </p>
        </div>
      </footer>

    </div>
  );
}
