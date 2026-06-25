import Link from "next/link";
import type { ReactNode } from "react";
import "./legal-doc.css";

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

    </div>
  );
}
