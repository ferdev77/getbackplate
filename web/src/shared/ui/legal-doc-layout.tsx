"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type LegalDocLayoutProps = {
  docLabel: string;
  title: string;
  subtitle: string;
  effective: string;
  lastUpdated: string;
  version: string;
  children: ReactNode;
};

export function LegalDocLayout({ docLabel, title, subtitle, effective, lastUpdated, version, children }: LegalDocLayoutProps) {
  return (
    <div className="legal-doc">
      <nav className="page-nav">
        <Link href="/">getbackplate.com</Link>
        <Link href="/legal">Back to Legal</Link>
      </nav>

      <main className="container">
        <span className="doc-label">{docLabel}</span>
        <h1>{title}</h1>
        <p className="doc-subtitle">{subtitle}</p>

        <div className="doc-meta">
          <div><strong>Effective</strong><span>{effective}</span></div>
          <div><strong>Last Updated</strong><span>{lastUpdated}</span></div>
          <div><strong>Version</strong><span>{version}</span></div>
        </div>

        {children}
      </main>

      <footer className="footer">
        <div>
          <strong>Backplate Technologies LLC, d/b/a GetBackplate</strong><br />
          1321 Upland Dr., Suite 9894 · Houston, TX 77043 · United States
        </div>
        <div style={{ textAlign: "right" }}>
          <Link href="/legal">Back to Legal</Link><br />
          Version {version}
        </div>
      </footer>

      <style jsx global>{`
        .legal-doc {
          --legal-accent: #c04a17;
          --legal-accent-soft: #fef7f2;
          --legal-text: #1a1a1a;
          --legal-text-muted: #6b7280;
          --legal-text-light: #9ca3af;
          --legal-border: #e5e7f0;
          --legal-bg: #fff;
          --legal-bg-soft: #fafafb;
          --legal-radius: 12px;
          --legal-max-width: 760px;
          font-family: var(--font-plus-jakarta-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--legal-text);
          background: var(--legal-bg);
          line-height: 1.65;
          font-size: 16px;
          font-weight: 400;
        }
        .legal-doc .page-nav {
          max-width: var(--legal-max-width);
          margin: 0 auto;
          padding: 32px 24px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }
        .legal-doc .page-nav a {
          color: var(--legal-text-muted);
          text-decoration: none;
          transition: color 0.15s;
        }
        .legal-doc .page-nav a:hover { color: var(--legal-accent); }
        .legal-doc .container {
          max-width: var(--legal-max-width);
          margin: 0 auto;
          padding: 48px 24px 96px;
        }
        .legal-doc .doc-label {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: var(--legal-accent);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 12px;
        }
        .legal-doc h1 {
          font-size: 38px;
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }
        .legal-doc .doc-subtitle {
          font-size: 18px;
          color: var(--legal-text-muted);
          font-weight: 400;
          margin-bottom: 28px;
        }
        .legal-doc .doc-meta {
          display: flex;
          gap: 32px;
          flex-wrap: wrap;
          padding: 14px 18px;
          background: var(--legal-bg-soft);
          border-radius: var(--legal-radius);
          margin-bottom: 48px;
          font-size: 14px;
        }
        .legal-doc .doc-meta strong {
          display: block;
          color: var(--legal-text-muted);
          font-weight: 500;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .legal-doc .doc-meta span { color: var(--legal-text); font-weight: 500; }
        .legal-doc h2 {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-top: 44px;
          margin-bottom: 16px;
        }
        .legal-doc h2 .section-num { color: var(--legal-accent); font-weight: 700; margin-right: 10px; }
        .legal-doc h3 { font-size: 16px; font-weight: 600; margin-top: 22px; margin-bottom: 6px; }
        .legal-doc h3 .sub-num { color: var(--legal-text-muted); font-weight: 600; margin-right: 8px; }
        .legal-doc p { margin-bottom: 14px; }
        .legal-doc ul, .legal-doc ol { margin-bottom: 14px; padding-left: 22px; }
        .legal-doc li { margin-bottom: 6px; }
        .legal-doc strong { font-weight: 600; color: var(--legal-text); }
        .legal-doc .container a {
          color: var(--legal-accent);
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
        }
        .legal-doc .container a:hover { text-decoration-thickness: 2px; }
        .legal-doc .contact-block {
          margin-top: 36px;
          padding: 24px;
          background: var(--legal-bg-soft);
          border-radius: var(--legal-radius);
        }
        .legal-doc .contact-block strong { display: block; margin-bottom: 8px; font-size: 16px; }
        .legal-doc .preamble {
          padding: 18px 22px;
          background: var(--legal-accent-soft);
          border-left: 3px solid var(--legal-accent);
          border-radius: 0 6px 6px 0;
          margin-bottom: 36px;
          font-size: 15px;
        }
        .legal-doc .uppercase-clause {
          text-transform: uppercase;
          font-size: 14px;
          letter-spacing: 0.01em;
          line-height: 1.6;
        }
        .legal-doc .schedule {
          margin-top: 56px;
          padding-top: 36px;
          border-top: 1px solid var(--legal-border);
        }
        .legal-doc .schedule-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--legal-accent);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }
        .legal-doc .schedule h2 { font-size: 26px; margin-top: 4px; margin-bottom: 20px; }
        .legal-doc table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
        .legal-doc th, .legal-doc td {
          text-align: left;
          padding: 12px 14px;
          border-bottom: 1px solid var(--legal-border);
          vertical-align: top;
        }
        .legal-doc th {
          background: var(--legal-bg-soft);
          font-weight: 600;
          color: var(--legal-text-muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 2px solid var(--legal-border);
        }
        .legal-doc .pricing-example {
          background: var(--legal-bg-soft);
          padding: 16px 20px;
          border-radius: var(--legal-radius);
          margin-top: 20px;
          font-size: 14px;
        }
        .legal-doc .pricing-example strong { display: block; margin-bottom: 8px; }
        .legal-doc .pricing-example .total {
          padding-top: 8px;
          margin-top: 8px;
          border-top: 1px solid var(--legal-border);
          font-weight: 600;
        }
        .legal-doc .acceptance-block {
          margin-top: 56px;
          padding: 28px;
          background: var(--legal-accent-soft);
          border-radius: var(--legal-radius);
        }
        .legal-doc .acceptance-block h2 { margin-top: 0; margin-bottom: 16px; font-size: 20px; }
        .legal-doc .acceptance-block .party {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px dashed var(--legal-border);
        }
        .legal-doc .acceptance-block .party:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
        .legal-doc .acceptance-block .party-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--legal-accent);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
        }
        .legal-doc .footer {
          max-width: var(--legal-max-width);
          margin: 0 auto;
          padding: 32px 24px 48px;
          border-top: 1px solid var(--legal-border);
          font-size: 13px;
          color: var(--legal-text-light);
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .legal-doc .footer a { color: var(--legal-text-muted); }
        @media (max-width: 640px) {
          .legal-doc h1 { font-size: 30px; }
          .legal-doc h2 { font-size: 19px; }
          .legal-doc .container { padding: 36px 18px 72px; }
          .legal-doc .doc-meta { gap: 18px; }
          .legal-doc .acceptance-block { padding: 20px; }
        }
        @media print {
          .legal-doc .page-nav, .legal-doc .footer { display: none; }
          .legal-doc .container { padding: 24px; max-width: 100%; }
          .legal-doc .contact-block,
          .legal-doc .preamble,
          .legal-doc .acceptance-block,
          .legal-doc .pricing-example { background: transparent; border: 1px solid var(--legal-border); }
          .legal-doc { font-size: 11pt; }
        }
      `}</style>
    </div>
  );
}
