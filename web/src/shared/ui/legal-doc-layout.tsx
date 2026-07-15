import type { ReactNode } from "react";
import "./legal-doc.css";
import { IntegrationSiteFooter, IntegrationSiteHeader } from "@/modules/landing/ui/integration-site-chrome";

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
      <IntegrationSiteHeader />

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

      <IntegrationSiteFooter />

    </div>
  );
}
