import Link from "next/link";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { IntegrationSiteFooter, IntegrationSiteHeader } from "@/modules/landing/ui/integration-site-chrome";

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

export const metadata = {
  title: "Trust Center | GetBackplate",
  description: "How GetBackplate protects data, who we share it with, and what we're working on.",
};

const STYLES = `
.trust-page{
  --accent:#D4531A; --accent-light:#FCE9DF; --accent-dark:#A23E12;
  --bg:#F7F8FC; --surface:#FFFFFF; --text:#14151A;
  --text-secondary:#595B66; --text-muted:#8A8C95;
  --border:#E6E8EE; --border-strong:#D6D8E0;
  --success:#15803D; --success-bg:#E7F5EC;
  --warning:#B45309; --warning-bg:#FEF3D7;
  --neutral:#525866; --neutral-bg:#EEF0F4;
  --radius-sm:6px; --radius:10px; --radius-lg:16px;
  font-family:var(--font-jakarta,'Plus Jakarta Sans',system-ui,-apple-system,sans-serif);
  font-size:16px; line-height:1.6; color:var(--text); background:var(--bg);
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
}
.trust-page *{box-sizing:border-box;}
.trust-page h1,.trust-page h2,.trust-page h3,.trust-page p,.trust-page ul,.trust-page table{margin:0;padding:0;}
.trust-page ul{list-style:none;}
.trust-page a{color:var(--accent);text-decoration:none;transition:color .15s ease;}
.trust-page a:hover{color:var(--accent-dark);}
.trust-page .mono{font-family:var(--font-mono,'JetBrains Mono',monospace);}
.trust-page .container{max-width:960px;margin:0 auto;padding:0 24px;}

.trust-page .hero{padding:80px 0 56px;border-bottom:1px solid var(--border);}
.trust-page .hero-eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-mono,monospace);font-size:12px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);margin-bottom:24px;}
.trust-page .hero-eyebrow::before{content:'';width:8px;height:8px;background:var(--accent);border-radius:50%;}
.trust-page .hero h1{font-size:clamp(40px,6vw,64px);line-height:1.05;font-weight:700;letter-spacing:-.025em;margin-bottom:24px;color:var(--text);}
.trust-page .hero-lede{font-size:20px;line-height:1.5;color:var(--text-secondary);max-width:640px;margin-bottom:32px;}
.trust-page .hero-meta{display:flex;gap:24px;font-family:var(--font-mono,monospace);font-size:13px;color:var(--text-muted);flex-wrap:wrap;}
.trust-page .hero-meta span{display:inline-flex;align-items:center;gap:6px;}
.trust-page .hero-meta strong{color:var(--text-secondary);font-weight:500;}

.trust-page .status-board{padding:56px 0 16px;}
.trust-page .status-label{font-family:var(--font-mono,monospace);font-size:12px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted);margin-bottom:20px;}
.trust-page .status-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.trust-page .status-cell{background:var(--surface);padding:24px;display:flex;flex-direction:column;gap:12px;}
.trust-page .status-cell-header{display:flex;align-items:center;justify-content:space-between;}
.trust-page .status-cell-name{font-size:13px;font-weight:500;color:var(--text-secondary);letter-spacing:.01em;}
.trust-page .status-cell-value{font-size:18px;font-weight:600;color:var(--text);letter-spacing:-.01em;line-height:1.3;}
.trust-page .status-cell-detail{font-size:13px;color:var(--text-muted);line-height:1.5;}

.trust-page .pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:3px 8px;border-radius:100px;font-family:var(--font-mono,monospace);}
.trust-page .pill::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;}
.trust-page .pill-active{background:var(--success-bg);color:var(--success);}
.trust-page .pill-planned{background:var(--warning-bg);color:var(--warning);}
.trust-page .pill-na{background:var(--neutral-bg);color:var(--neutral);}

.trust-page .section{padding:56px 0;border-top:1px solid var(--border);}
.trust-page .section:first-of-type{border-top:none;}
.trust-page .section-grid{display:grid;grid-template-columns:200px 1fr;gap:40px;}
.trust-page .section-aside{position:sticky;top:88px;align-self:start;}
.trust-page .section-number{font-family:var(--font-mono,monospace);font-size:12px;font-weight:500;color:var(--text-muted);letter-spacing:.04em;margin-bottom:8px;}
.trust-page .section-title{font-size:22px;font-weight:600;letter-spacing:-.015em;color:var(--text);line-height:1.2;}
.trust-page .section-content > * + *{margin-top:16px;}
.trust-page .section-content p{color:var(--text-secondary);line-height:1.65;}
.trust-page .section-content p strong{color:var(--text);font-weight:600;}

.trust-page .spec-table{width:100%;margin-top:8px;border-collapse:collapse;font-size:14px;}
.trust-page .spec-table tr{border-bottom:1px solid var(--border);}
.trust-page .spec-table tr:last-child{border-bottom:none;}
.trust-page .spec-table th,.trust-page .spec-table td{text-align:left;padding:14px 0;vertical-align:top;font-weight:400;}
.trust-page .spec-table th{width:38%;color:var(--text-secondary);font-weight:500;padding-right:16px;}
.trust-page .spec-table td{color:var(--text);}
.trust-page .spec-table code{font-family:var(--font-mono,monospace);font-size:13px;background:var(--neutral-bg);padding:2px 6px;border-radius:4px;color:var(--text);}

.trust-page .check-list{display:flex;flex-direction:column;gap:10px;}
.trust-page .check-list li{display:flex;gap:12px;align-items:flex-start;color:var(--text-secondary);line-height:1.5;}
.trust-page .check-list li .ck-icon{flex-shrink:0;display:block;width:16px;height:16px;margin-top:4px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3 8l3.5 3.5L13 5' stroke='%2315803D' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;}
.trust-page .check-list li .ck-text{flex:1;min-width:0;}
.trust-page .check-list li strong{color:var(--text);font-weight:600;}
.trust-page .check-list.is-planned li .ck-icon{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Ccircle cx='8' cy='8' r='6' stroke='%23B45309' stroke-width='1.5' stroke-dasharray='2 2'/%3E%3C/svg%3E");}

.trust-page .vendor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:8px;}
.trust-page .vendor-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;transition:border-color .15s ease;}
.trust-page .vendor-card:hover{border-color:var(--border-strong);}
.trust-page .vendor-name{font-weight:600;font-size:15px;color:var(--text);margin-bottom:4px;}
.trust-page .vendor-purpose{font-size:13px;color:var(--text-muted);line-height:1.4;}

.trust-page .report-block{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:32px;margin-top:16px;}
.trust-page .report-headline{font-size:18px;font-weight:600;letter-spacing:-.01em;color:var(--text);margin-bottom:8px;}
.trust-page .report-block p{color:var(--text-secondary);margin-bottom:16px;}
.trust-page .report-email{display:inline-flex;align-items:center;gap:10px;padding:12px 18px;background:var(--accent);color:#fff;border-radius:var(--radius-sm);font-weight:600;font-size:15px;transition:background .15s ease;}
.trust-page .report-email:hover{background:var(--accent-dark);color:#fff;}
.trust-page .report-email code{font-family:var(--font-jakarta,inherit);font-size:15px;}

.trust-page .transparency-block{background:linear-gradient(180deg,var(--bg) 0%,var(--surface) 100%);border:1px solid var(--border);border-radius:var(--radius-lg);padding:32px;margin-top:16px;}
.trust-page .transparency-block .section-title{margin-bottom:8px;}
.trust-page .transparency-block p{color:var(--text-secondary);font-size:15px;margin-bottom:16px;}

.trust-page .note-callout{border-left:3px solid var(--warning);background:var(--warning-bg);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:14px 16px;font-size:13.5px;color:var(--text);line-height:1.55;}
.trust-page .note-callout strong{color:var(--warning);}

@media (max-width:768px){
  .trust-page .container{padding:0 20px;}
  .trust-page .hero{padding:56px 0 40px;}
  .trust-page .hero h1{font-size:40px;}
  .trust-page .hero-lede{font-size:18px;}
  .trust-page .hero-meta{flex-direction:column;gap:8px;}
  .trust-page .section{padding:40px 0;}
  .trust-page .section-grid{grid-template-columns:1fr;gap:20px;}
  .trust-page .section-aside{position:static;}
  .trust-page .spec-table th{width:45%;}
}
`;

export default function TrustCenterPage() {
  return (
    <div className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}>
      <IntegrationSiteHeader />
      <div className="trust-page">
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <main>
        <section className="hero">
          <div className="container">
            <div className="hero-eyebrow">Trust Center</div>
            <h1>How we protect data, who we share it with, and what we&apos;re working on.</h1>
            <p className="hero-lede">
              Most security pages are marketing. This is documentation — written for security
              teams, partners, and customers doing real due diligence.
            </p>
            <div className="hero-meta">
              <span><strong>Last updated</strong> July 19, 2026</span>
              <span><strong>Version</strong> 2026.07.19</span>
              <span><strong>Entity</strong> Backplate Technologies LLC</span>
            </div>
          </div>
        </section>

        <section className="status-board">
          <div className="container">
            <div className="status-label">At a glance</div>
            <div className="status-grid">

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Encryption</div>
                  <span className="pill pill-active">Active</span>
                </div>
                <div className="status-cell-value">TLS in transit + AES-256-GCM at rest</div>
                <div className="status-cell-detail">
                  All HTTP traffic served over TLS with HSTS enforced. OAuth tokens and delivery
                  credentials encrypted with AES-256-GCM before storage.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Tenant isolation</div>
                  <span className="pill pill-active">Active</span>
                </div>
                <div className="status-cell-value">Row-Level Security</div>
                <div className="status-cell-detail">
                  Every tenant table is scoped to an organization via Postgres RLS. A database
                  trigger auto-enables RLS on any new table by default.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Data scope</div>
                  <span className="pill pill-active">Limited</span>
                </div>
                <div className="status-cell-value">B2B metadata only</div>
                <div className="status-cell-detail">
                  No PHI, no cardholder data, no consumer data. Business contact information and
                  invoice/credit memo metadata only.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Data residency</div>
                  <span className="pill pill-active">US-based</span>
                </div>
                <div className="status-cell-value">United States infrastructure</div>
                <div className="status-cell-detail">
                  Application functions run primarily in Vercel&apos;s Portland, Oregon region
                  (pdx1), alongside the database in AWS us-west-2.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Access control</div>
                  <span className="pill pill-active">Active</span>
                </div>
                <div className="status-cell-value">Role-based, audited</div>
                <div className="status-cell-detail">
                  Per-organization roles and permissions, with a functioning audit log on
                  integration and account actions.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Webhook integrity</div>
                  <span className="pill pill-active">Active</span>
                </div>
                <div className="status-cell-value">HMAC-verified</div>
                <div className="status-cell-detail">
                  Every incoming Intuit webhook is HMAC-SHA256 verified with a constant-time
                  comparison before it is processed.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Liability coverage</div>
                  <span className="pill pill-na">Contractual</span>
                </div>
                <div className="status-cell-value">$1M / $2M USD</div>
                <div className="status-cell-detail">
                  Our Master Services Agreement commits to Tech E&amp;O and Cyber Liability
                  coverage of $1,000,000 per occurrence / $2,000,000 in the aggregate.
                </div>
              </div>

              <div className="status-cell">
                <div className="status-cell-header">
                  <div className="status-cell-name">Third-party audit</div>
                  <span className="pill pill-planned">Planned</span>
                </div>
                <div className="status-cell-value">Pentest + SOC 2 on roadmap</div>
                <div className="status-cell-detail">
                  No third-party penetration test or SOC 2 report exists yet. See the roadmap
                  below.
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">01 · Encryption</div>
                <div className="section-title">Data in transit and at rest</div>
              </aside>
              <div className="section-content">
                <p>
                  All traffic between the platform and your browser is encrypted in transit.
                  Sensitive credentials — QuickBooks® Online OAuth tokens and Restaurant365 delivery
                  credentials — are encrypted at the application layer before they are ever written
                  to the database.
                </p>

                <table className="spec-table">
                  <tbody>
                    <tr><th>Transport encryption</th><td>TLS enforced for all HTTP traffic, with HSTS (Strict-Transport-Security) on every response</td></tr>
                    <tr><th>Invoice delivery transport</th><td>FTP or FTPS, according to the destination endpoint configuration; FTPS uses TLS when enabled</td></tr>
                    <tr><th>Credential encryption</th><td>AES-256-GCM, applied at the application layer to OAuth tokens and Restaurant365 delivery credentials before storage</td></tr>
                    <tr><th>Database encryption</th><td>Managed Postgres (Supabase) with encryption at rest on the underlying volume</td></tr>
                    <tr><th>Token refresh</th><td>QuickBooks® Online access tokens are refreshed automatically before they expire; a failed refresh marks the connection as disconnected rather than failing silently</td></tr>
                    <tr><th>Webhook verification</th><td>HMAC-SHA256 signature check with constant-time comparison on every incoming Intuit webhook</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">02 · Authentication</div>
                <div className="section-title">Who accesses what</div>
              </aside>
              <div className="section-content">
                <p>
                  Customer authentication to QuickBooks® Online is fully mediated by Intuit&apos;s
                  OAuth 2.0 flow — we never see or store QuickBooks® Online passwords. Internal access to
                  production data is restricted and scoped per organization at the database level.
                </p>

                <ul className="check-list">
                  <li><span className="ck-icon" /><span className="ck-text"><strong>OAuth 2.0 with Intuit.</strong> Customers authorize access to their QuickBooks® Online data through Intuit&apos;s own hosted flow.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Tenant isolation via Row-Level Security.</strong> Every tenant-scoped table enforces RLS keyed to <code className="mono">organization_id</code>; membership and role tables are RLS-protected as well.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Role-based access within each organization.</strong> Permissions are assigned per role (e.g. company admin vs. employee), enforced by policy, not just application logic.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Email-based two-step verification.</strong> Required on every login for administrative accounts on organizations with the QuickBooks® Online integration active; available as an opt-in for other accounts.</span></li>
                </ul>

                <div className="note-callout">
                  <strong>Current OAuth scope:</strong> we request Intuit&apos;s <code className="mono">com.intuit.quickbooks.accounting</code> scope, which covers the full accounting API — Intuit does not offer a narrower, read-only scope for invoices and customers alone.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">03 · Infrastructure</div>
                <div className="section-title">Where data lives</div>
              </aside>
              <div className="section-content">
                <p>
                  Customer data is processed and stored on infrastructure located in the United
                  States. Application functions are configured to run primarily in Vercel&apos;s
                  Portland, Oregon region (pdx1), alongside the database on AWS us-west-2.
                </p>

                <table className="spec-table">
                  <tbody>
                    <tr><th>Compute</th><td>Vercel Functions — Portland, Oregon, USA (pdx1), configured as the primary function region near the database</td></tr>
                    <tr><th>Database</th><td>Supabase-managed PostgreSQL, hosted on AWS (us-west-2)</td></tr>
                    <tr><th>Outbound delivery</th><td>FTP or FTPS to a Restaurant365 endpoint, configurable per customer connection; SFTP is not currently supported</td></tr>
                    <tr><th>Data residency</th><td>Application compute and database infrastructure are located in the United States</td></tr>
                    <tr><th>Underlying provider</th><td>Amazon Web Services (AWS) — independently certified SOC 2 Type 2, ISO 27001, PCI DSS Level 1</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">04 · Data scope</div>
                <div className="section-title">What we collect, and what we don&apos;t</div>
              </aside>
              <div className="section-content">
                <p>
                  We collect the minimum data needed to deliver QuickBooks® Online invoices to
                  Restaurant365. Most of what we process is B2B metadata: company names, invoice
                  lines, payment terms. We deliberately avoid sensitive data categories we don&apos;t
                  need.
                </p>

                <ul className="check-list">
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Business contact information.</strong> Names, emails, phone numbers, and business addresses of customer contacts.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Invoice and credit memo metadata.</strong> Vendor names, customer names, line items, amounts, dates, account numbers, and locations.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>OAuth tokens.</strong> Encrypted Intuit tokens, used only to access the QuickBooks® Online data each customer has authorized.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text"><strong>Operational logs.</strong> An audit trail of every document processed, for compliance and support purposes.</span></li>
                </ul>

                <p style={{ marginTop: 24 }}><strong>What we don&apos;t collect or store:</strong></p>

                <ul className="check-list is-planned">
                  <li><span className="ck-icon" /><span className="ck-text">No personal health information (PHI) or HIPAA-regulated data.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text">No credit card numbers or cardholder data. All payments are processed by Stripe.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text">No banking credentials. Stripe handles payment methods directly.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text">No Social Security numbers, driver&apos;s license numbers, or other government IDs.</span></li>
                  <li><span className="ck-icon" /><span className="ck-text">No consumer or end-user data. Our customers are businesses.</span></li>
                </ul>

                <div className="note-callout">
                  <strong>Note on retention:</strong> operational QBO/webhook/run records and raw payloads are automatically
                  purged after 12 months. Minimum fiscal and billing records are retained for up to seven years.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">05 · Backups</div>
                <div className="section-title">If something goes wrong</div>
              </aside>
              <div className="section-content">
                <p>
                  Our managed database provider runs automated daily backups. We have not yet
                  published a specific recovery point/time objective or a formal, tested restore
                  runbook — see the roadmap in section 09 for what&apos;s next here.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">06 · Insurance</div>
                <div className="section-title">Financial protection</div>
              </aside>
              <div className="section-content">
                <p>
                  Our Master Services Agreement contractually commits us to maintain Technology
                  Errors &amp; Omissions and Cyber Liability insurance for the duration of the
                  agreement.
                </p>

                <table className="spec-table">
                  <tbody>
                    <tr><th>Technology E&amp;O</th><td>$1,000,000 USD per occurrence / $2,000,000 USD in the aggregate</td></tr>
                    <tr><th>Cyber Liability</th><td>$1,000,000 USD per occurrence / $2,000,000 USD in the aggregate</td></tr>
                    <tr><th>Certificate of Insurance</th><td>Available on written request</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">07 · Incident response</div>
                <div className="section-title">If a breach occurs</div>
              </aside>
              <div className="section-content">
                <p>
                  We maintain a documented Incident Response and Breach Notification Protocol,
                  following the NIST SP 800-61 framework. Customers affected by any confirmed
                  security incident will be notified directly within 72 hours of discovery, in line
                  with applicable breach notification laws.
                </p>
                <p>
                  <Link href="/legal/integration/incident-response">Read our Incident Response documentation</Link>{" "}
                  for our detection sources, response phases, notification commitments, and recovery
                  objectives. The full internal Protocol is available under confidentiality upon
                  request for security review or vendor risk assessment.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">08 · Subprocessors</div>
                <div className="section-title">Who we work with</div>
              </aside>
              <div className="section-content">
                <p>
                  We use a small, deliberate set of subprocessors. Each is listed below with the
                  specific purpose it serves. We do not sell customer data or share it with
                  marketing or advertising platforms.
                </p>

                <div className="vendor-grid">
                  <div className="vendor-card">
                    <div className="vendor-name">Supabase</div>
                    <div className="vendor-purpose">Database, file storage, and edge functions.</div>
                  </div>
                  <div className="vendor-card">
                    <div className="vendor-name">Vercel</div>
                    <div className="vendor-purpose">Application hosting, serverless compute, scheduled jobs.</div>
                  </div>
                  <div className="vendor-card">
                    <div className="vendor-name">Stripe</div>
                    <div className="vendor-purpose">Payment processing, billing, tax calculation.</div>
                  </div>
                  <div className="vendor-card">
                    <div className="vendor-name">Intuit (QuickBooks® Online)</div>
                    <div className="vendor-purpose">OAuth authorization; source of truth for invoice and customer data.</div>
                  </div>
                  <div className="vendor-card">
                    <div className="vendor-name">Restaurant365</div>
                    <div className="vendor-purpose">Destination FTP endpoint for invoice and credit memo delivery.</div>
                  </div>
                  <div className="vendor-card">
                    <div className="vendor-name">Anthropic</div>
                    <div className="vendor-purpose">AI features in the Operations Platform, via the Claude API.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">09 · Compliance</div>
                <div className="section-title">Where we are, and where we&apos;re going</div>
              </aside>
              <div className="section-content">
                <div className="transparency-block">
                  <div className="section-title" style={{ marginBottom: 12, fontSize: 18 }}>What we have today</div>
                  <ul className="check-list">
                    <li><span className="ck-icon" /><span className="ck-text">TLS for HTTP traffic and configured FTPS deliveries, plus encryption at rest for production data.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">FTP or FTPS delivery according to each Restaurant365 endpoint configuration, with TLS when FTPS is enabled.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Row-Level Security enforcing tenant isolation, with a database trigger that auto-enables it on new tables.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Role-based access control and a functioning audit log.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Tech E&amp;O and Cyber Liability coverage committed at $1M / $2M USD via our Master Services Agreement.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Privacy Policy and Terms of Service published and versioned for both products.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Retention policy enforced by a scheduled daily job: 12 months for operational integration data and seven years for minimum fiscal and billing records.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Email-based two-step verification, required for administrative accounts on organizations with the QuickBooks® Online integration active.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text">Documented Incident Response and Breach Notification Protocol, following the NIST SP 800-61 framework — see our <Link href="/legal/integration/incident-response">Incident Response documentation</Link>.</span></li>
                  </ul>
                </div>

                <div className="transparency-block">
                  <div className="section-title" style={{ marginBottom: 12, fontSize: 18 }}>What&apos;s on the roadmap</div>
                  <ul className="check-list is-planned">
                    <li><span className="ck-icon" /><span className="ck-text"><strong>Third-party penetration test —</strong> first external test, cadence to follow.</span></li>
                    <li><span className="ck-icon" /><span className="ck-text"><strong>SOC 2 —</strong> considered for a future date, subject to customer demand.</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-grid">
              <aside className="section-aside">
                <div className="section-number">10 · Report an issue</div>
                <div className="section-title">Found something?</div>
              </aside>
              <div className="section-content">
                <p>
                  We welcome security reports from researchers, customers, and the wider community.
                  We do not currently run a paid bug bounty program, but we will publicly credit
                  contributions that help us resolve material issues.
                </p>

                <div className="report-block">
                  <div className="report-headline">Report a security issue</div>
                  <p>
                    Send details — including reproduction steps, scope, and impact — to the address
                    below.
                  </p>
                  <a className="report-email" href="mailto:security@getbackplate.com">
                    <code>security@getbackplate.com</code>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        </main>
      </div>
      <IntegrationSiteFooter />
    </div>
  );
}
