import { PublicReferralFormClient } from "./public-referral-form-client";
import { IntegrationSiteFooter, IntegrationSiteHeader } from "@/modules/landing/ui/integration-site-chrome";

export const metadata = {
  title: "Refer a vendor · GetBackplate",
  description:
    "Refer a vendor still sending invoices as PDFs and we'll automate their delivery to your Restaurant365.",
};

export default function PublicReferPage() {
  return (
    // Fondo blanco y tipografia igual que los documentos legales, y el header y
    // el footer del sitio en vez de una barra propia con el logo suelto.
    <div lang="en" style={{
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      fontSize: 16,
      lineHeight: 1.6,
      color: "#1a1a1a",
      background: "#fff",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>

      <IntegrationSiteHeader />

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
            color: "#c04a17",
            marginBottom: 20,
          }}>
            <span style={{ width: 6, height: 6, background: "#c04a17", borderRadius: "50%", display: "inline-block" }} />
            Referral
          </div>

          <h1 style={{
            fontSize: "clamp(28px, 5vw, 36px)",
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            marginBottom: 32,
            color: "#1a1a1a",
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

      <IntegrationSiteFooter />

    </div>
  );
}
