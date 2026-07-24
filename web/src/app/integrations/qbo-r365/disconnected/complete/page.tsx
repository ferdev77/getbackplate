import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";
import { IntuitSignInButton } from "@/shared/ui/intuit-sign-in-button";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "QuickBooks® Online disconnected | GetBackplate",
};

export default function IntegrationDisconnectedPage() {
  return (
    <div
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
      style={{
        fontFamily:
          "var(--font-jakarta, 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif)",
        background: "#F7F8FC",
        color: "#14151A",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header style={{ padding: "24px 0", borderBottom: "1px solid #E6E8EE" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/getbackplate-logo-light.svg"
              alt="GetBackplate"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </Link>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#FDE7E6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 32px",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="#B42318"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-jakarta, sans-serif)",
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginBottom: 20,
            }}
          >
            QuickBooks® Online disconnect received.
          </h1>

          <p style={{ fontSize: 18, color: "#595B66", lineHeight: 1.6, marginBottom: 12 }}>
            QuickBooks sent GetBackplate a disconnect notification. We are securely confirming that
            the authorization was revoked.
          </p>

          <p style={{ fontSize: 15, color: "#8A8C95", lineHeight: 1.6, marginBottom: 40 }}>
            Sign in to review the connection status. If the disconnect completed, you can reconnect
            from Integrations → QuickBooks® Online.
          </p>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <IntuitSignInButton href="/api/auth/intuit/start?returnTo=%2Fapp%2Fintegrations%2Fquickbooks" />
          </div>
          <p style={{ marginTop: 14, fontSize: 13 }}>
            <a href="/auth/login?desde=integracion" style={{ color: "#595B66" }}>Or sign in with your GetBackplate password</a>
          </p>
        </div>
      </main>
      <footer style={{ padding: "20px 32px", borderTop: "1px solid #E6E8EE", color: "#8A8C95", fontSize: 12, textAlign: "center" }}>
        Backplate Technologies LLC, d/b/a GetBackplate · {COMPANY_ADDRESS.inline}
      </footer>
    </div>
  );
}
