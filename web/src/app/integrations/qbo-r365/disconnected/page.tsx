import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Inter_Tight } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "QuickBooks desconectado | GetBackplate",
};

export default function IntegrationDisconnectedPage() {
  return (
    <div
      className={`${fraunces.variable} ${interTight.variable}`}
      style={{
        fontFamily:
          "var(--font-inter-tight, 'Inter Tight', -apple-system, system-ui, sans-serif)",
        background: "#F7F4EE",
        color: "#161614",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header style={{ padding: "24px 0", borderBottom: "1px solid #E5DFD3" }}>
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
              background: "rgba(180,58,46,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 32px",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="#B23A2E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-fraunces, serif)",
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginBottom: 20,
            }}
          >
            QuickBooks desconectado.
          </h1>

          <p style={{ fontSize: 18, color: "#6B6760", lineHeight: 1.6, marginBottom: 12 }}>
            La conexión entre GetBackplate y tu cuenta de QuickBooks Online{" "}
            <strong style={{ color: "#161614" }}>fue terminada</strong>.
          </p>

          <p style={{ fontSize: 15, color: "#9B968D", lineHeight: 1.6, marginBottom: 40 }}>
            Las sincronizaciones automáticas hacia Restaurant365 quedaron pausadas hasta que
            vuelvas a conectar tu cuenta. Para reconectar: iniciá sesión en tu cuenta de
            GetBackplate, entrá a Integraciones → QuickBooks Online, y elegí &ldquo;Conectar
            QBO&rdquo;.
          </p>

          <a
            href="/auth/login"
            style={{
              display: "inline-block",
              padding: "13px 28px",
              borderRadius: 100,
              background: "#161614",
              color: "#F7F4EE",
              border: "1.5px solid #161614",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
            }}
          >
            Iniciar sesión para reconectar
          </a>
        </div>
      </main>
    </div>
  );
}
