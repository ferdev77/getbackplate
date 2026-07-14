import Link from "next/link";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata = {
  title: "Incident Response | GetBackplate",
  description: "How GetBackplate detects, responds to, and communicates about security incidents affecting the Integration product.",
};

const STYLES = `
.ir-page{
  --accent:#D4531A; --accent-light:#FCE9DF; --accent-dark:#A23E12;
  --bg:#F7F8FC; --surface:#FFFFFF; --text:#14151A;
  --text-secondary:#595B66; --text-light:#8A8C95; --text-muted:#8A8C95;
  --border:#E6E8EE; --success:#15803D; --success-bg:#E7F5EC;
  --radius:10px; --max-width:860px;
  font-family:var(--font-jakarta,'Plus Jakarta Sans',system-ui,-apple-system,sans-serif);
  font-size:15px; line-height:1.65; color:var(--text); background:var(--bg);
  -webkit-font-smoothing:antialiased;
}
.ir-page *{box-sizing:border-box;}
.ir-page a{color:var(--accent);text-decoration:none;}
.ir-page a:hover{color:var(--accent-dark);}
.ir-page .mono{font-family:var(--font-mono,'JetBrains Mono',monospace);}

.ir-page .page-nav{background:var(--surface);border-bottom:1px solid var(--border);padding:16px 0;}
.ir-page .page-nav-inner{max-width:var(--max-width);margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;}
.ir-page .brand{font-weight:700;font-size:16px;color:var(--text);letter-spacing:-.01em;}
.ir-page .brand-dot{color:var(--accent);}
.ir-page .nav-badge{font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);padding:4px 10px;border:1px solid var(--border);border-radius:100px;}

.ir-page .container{max-width:var(--max-width);margin:0 auto;padding:48px 24px;}
.ir-page .section-header{margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid var(--border);}
.ir-page .section-eyebrow{font-family:var(--font-mono,monospace);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;}
.ir-page h1{font-size:clamp(26px,4vw,32px);line-height:1.2;font-weight:700;letter-spacing:-.02em;color:var(--text);margin-bottom:12px;}
.ir-page .intro{font-size:16px;color:var(--text-secondary);line-height:1.6;}

.ir-page h2{font-size:20px;font-weight:600;letter-spacing:-.015em;color:var(--text);margin:32px 0 14px;display:inline-block;padding-bottom:6px;border-bottom:2px solid var(--accent);}
.ir-page p{margin-bottom:14px;color:var(--text);}
.ir-page ul{margin:0 0 20px 24px;}
.ir-page li{margin-bottom:4px;}

.ir-page .approach{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin:20px 0;}
.ir-page .approach-list{display:grid;gap:14px;}
.ir-page .approach-item{display:flex;gap:12px;align-items:flex-start;}
.ir-page .approach-icon{width:28px;height:28px;background:var(--accent-light);color:var(--accent-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;}
.ir-page .approach-content{flex:1;}
.ir-page .approach-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;}
.ir-page .approach-desc{font-size:13px;color:var(--text-secondary);line-height:1.55;}

.ir-page .commitment{background:var(--accent-light);border-left:3px solid var(--accent);border-radius:var(--radius);padding:20px 24px;margin:20px 0;}
.ir-page .commitment-title{font-size:13px;font-weight:700;color:var(--accent-dark);letter-spacing:.03em;text-transform:uppercase;margin-bottom:10px;}
.ir-page .commitment-body{font-size:15px;color:var(--text);line-height:1.6;}
.ir-page .commitment-body strong{color:var(--accent-dark);font-weight:600;}

.ir-page .reporting{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin:20px 0;text-align:center;}
.ir-page .reporting-title{font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;}
.ir-page .reporting-desc{font-size:14px;color:var(--text-secondary);margin-bottom:14px;}
.ir-page .reporting-email{display:inline-block;background:var(--accent);color:#fff;padding:12px 24px;border-radius:6px;font-family:var(--font-mono,monospace);font-size:14px;font-weight:600;transition:background .15s ease;}
.ir-page .reporting-email:hover{background:var(--accent-dark);color:#fff;}
.ir-page .reporting-note{display:block;margin-top:12px;font-size:12px;color:var(--text-muted);font-family:var(--font-mono,monospace);}

.ir-page .full-doc{background:var(--surface);border:1px dashed var(--border);border-radius:var(--radius);padding:20px 24px;margin:20px 0;font-size:13px;color:var(--text-secondary);line-height:1.6;}
.ir-page .full-doc strong{color:var(--text);}

.ir-page .footer{max-width:var(--max-width);margin:0 auto;padding:32px 24px 48px;border-top:1px solid var(--border);font-size:13px;color:var(--text-light);display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.ir-page .footer a{color:var(--text-muted);}

@media (max-width:640px){
  .ir-page .container{padding:32px 20px;}
  .ir-page h1{font-size:24px;}
  .ir-page h2{font-size:18px;}
}
`;

export default function IncidentResponsePage() {
  return (
    <div className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} ir-page`}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <nav className="page-nav">
        <div className="page-nav-inner">
          <Link href="/" className="brand">GetBackplate<span className="brand-dot">.</span></Link>
          <div className="nav-badge">Trust Center · Integration</div>
        </div>
      </nav>

      <div className="container">

        <div className="section-header">
          <div className="section-eyebrow">Security Documentation</div>
          <h1>Incident Response</h1>
          <p className="intro">
            GetBackplate maintains an Incident Response and Breach Notification Protocol governing
            how we detect, respond to, and communicate about security incidents affecting our
            Integration product.
          </p>
        </div>

        <h2>Our Approach</h2>
        <p>
          Our incident response follows the NIST SP 800-61 framework (Computer Security Incident
          Handling Guide), adapted to our multi-tenant SaaS architecture and B2B foodservice
          integration context.
        </p>

        <div className="approach">
          <div className="approach-list">

            <div className="approach-item">
              <div className="approach-icon">1</div>
              <div className="approach-content">
                <div className="approach-title">Multi-source detection</div>
                <div className="approach-desc">Automated monitoring (application logs, uptime monitoring, error tracking), customer-reported issues via security@getbackplate.com, and partner notifications from Intuit, Restaurant365, and infrastructure providers.</div>
              </div>
            </div>

            <div className="approach-item">
              <div className="approach-icon">2</div>
              <div className="approach-content">
                <div className="approach-title">Severity classification with defined SLAs</div>
                <div className="approach-desc">Every incident is classified by severity (Critical, High, Medium, Low) with corresponding response time commitments ranging from under 1 hour to 72 hours.</div>
              </div>
            </div>

            <div className="approach-item">
              <div className="approach-icon">3</div>
              <div className="approach-content">
                <div className="approach-title">Structured response phases</div>
                <div className="approach-desc">Formal phases including detection and analysis, containment, eradication, recovery, and post-incident review, ensuring consistent handling of every incident.</div>
              </div>
            </div>

            <div className="approach-item">
              <div className="approach-icon">4</div>
              <div className="approach-content">
                <div className="approach-title">Timely customer notification</div>
                <div className="approach-desc">Affected customers are notified without undue delay, and within 72 hours for confirmed data breaches. Progress updates are provided during active incidents affecting service.</div>
              </div>
            </div>

            <div className="approach-item">
              <div className="approach-icon">5</div>
              <div className="approach-content">
                <div className="approach-title">Coordinated partner and regulatory notification</div>
                <div className="approach-desc">Notification to Intuit (QuickBooks Online), Restaurant365, Stripe, cyber insurance carriers, and regulatory authorities (CCPA, GDPR, state breach notification laws) as required by applicable law and contractual obligations.</div>
              </div>
            </div>

            <div className="approach-item">
              <div className="approach-icon">6</div>
              <div className="approach-content">
                <div className="approach-title">Post-incident review and continuous improvement</div>
                <div className="approach-desc">Formal review conducted within 14 days of incident closure, capturing lessons learned, root cause analysis, and improvement actions that update the Protocol and our security controls.</div>
              </div>
            </div>

          </div>
        </div>

        <h2>Our Commitments to Customers</h2>

        <div className="commitment">
          <div className="commitment-title">Notification Commitments</div>
          <div className="commitment-body">
            For any incident materially affecting your data or service, we commit to <strong>notification without undue delay</strong>. For confirmed data breaches, we commit to <strong>customer notification within 72 hours</strong> of breach determination. Progress updates are provided every four hours during active Critical or High severity incidents affecting your service.
          </div>
        </div>

        <div className="commitment">
          <div className="commitment-title">Recovery Objectives</div>
          <div className="commitment-body">
            Our Integration architecture targets an <strong>RPO of 24 hours</strong> (maximum acceptable data loss) and an <strong>RTO of 4 hours</strong> (maximum acceptable downtime for critical incidents). These are operational targets, not guarantees, and vary based on incident severity and scope.
          </div>
        </div>

        <div className="commitment">
          <div className="commitment-title">Post-Incident Transparency</div>
          <div className="commitment-body">
            For Critical incidents affecting customer data, we publish a <strong>detailed post-incident summary within 14 days</strong> of closure, including timeline, root cause, impact, and corrective actions taken.
          </div>
        </div>

        <h2>Regulatory Compliance</h2>
        <p>
          Our Protocol is designed to support compliance with applicable data protection laws and
          industry frameworks, including:
        </p>
        <ul>
          <li>California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA)</li>
          <li>General Data Protection Regulation (GDPR) and UK GDPR</li>
          <li>Texas Identity Theft Enforcement and Protection Act</li>
          <li>State breach notification laws across all 50 U.S. states</li>
          <li>Personal Information Protection and Electronic Documents Act (PIPEDA) for Canadian residents</li>
          <li>Contractual obligations under Intuit QuickBooks Online App Store agreements, Restaurant365 integration agreements, and the Stripe Services Agreement</li>
          <li>NIST SP 800-61 Computer Security Incident Handling Guide</li>
          <li>NIST Cybersecurity Framework</li>
        </ul>

        <h2>Reporting a Security Issue</h2>

        <div className="reporting">
          <div className="reporting-title">Discovered a potential security issue?</div>
          <div className="reporting-desc">
            We welcome reports from customers, partners, and security researchers.
          </div>
          <a href="mailto:security@getbackplate.com" className="reporting-email">security@getbackplate.com</a>
          <span className="reporting-note">All reports acknowledged within 24 hours</span>
        </div>

        <h2>Full Documentation</h2>

        <div className="full-doc">
          Our complete <strong>Incident Response and Breach Notification Protocol</strong> is available under confidentiality to customers, partners, auditors, and regulators upon request. To request access for security review, vendor risk assessment, or compliance evaluation, contact <a href="mailto:security@getbackplate.com">security@getbackplate.com</a>.
        </div>

        <h2>Related Documentation</h2>
        <ul>
          <li><Link href="/legal/integration/privacy">Privacy Policy — Integration</Link></li>
          <li><Link href="/legal/integration/terms">End-User License Agreement — Integration</Link></li>
          <li><Link href="/legal/integration/msa">Master Services Agreement — Integration</Link></li>
          <li><Link href="/trust">Trust Center</Link></li>
        </ul>

      </div>

      <footer className="footer">
        <div>
          <strong>Backplate Technologies LLC, d/b/a GetBackplate</strong><br />
          1001 S. 10th St., Suite G#784 · McAllen, TX 78501 · United States<br />
          <a href="mailto:security@getbackplate.com">security@getbackplate.com</a> · <a href="mailto:hello@getbackplate.com">hello@getbackplate.com</a>
        </div>
        <div style={{ textAlign: "right" }}>
          <Link href="/trust">Back to Trust</Link><br />
          Version 2026.07.23
        </div>
      </footer>

    </div>
  );
}
