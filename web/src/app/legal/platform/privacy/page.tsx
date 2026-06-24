import { LegalDocLayout } from "@/shared/ui/legal-doc-layout";

export const metadata = {
  title: "Privacy Policy | GetBackplate Platform",
  description: "Privacy Policy for the GetBackplate Restaurant Operations Management Platform.",
};

export default function PlatformPrivacyPage() {
  return (
    <LegalDocLayout
      docLabel="Operations Platform"
      title="Privacy Policy"
      subtitle="GetBackplate Restaurant Operations Management Platform"
      effective="July 23, 2026"
      lastUpdated="July 23, 2026"
      version="2026.07.23"
    >
      <h2><span className="section-num">1.</span>Introduction</h2>
      <p>This Privacy Policy explains how <strong>Backplate Technologies LLC</strong>, a Texas limited liability company, doing business as <strong>GetBackplate</strong> (&quot;GetBackplate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, stores, shares, and protects information when you use the GetBackplate restaurant operations management platform (the &quot;Service&quot; or &quot;Platform&quot;).</p>
      <p>GetBackplate is headquartered at 1321 Upland Dr., Suite 9894, Houston, Texas 77043, United States.</p>
      <p>This Privacy Policy applies to all users of the Platform, including account administrators (owners and managers) and employees who access the Platform through the employee portal. By using the Service, you consent to the practices described in this Policy.</p>

      <h2><span className="section-num">2.</span>Information We Collect</h2>

      <h3><span className="sub-num">2.1</span>Account and Business Information</h3>
      <p>When you register for the Platform, we collect:</p>
      <ul>
        <li>Business name, address, and contact information</li>
        <li>Administrator name, email address, and phone number</li>
        <li>Billing information processed through Stripe (we do not store full credit card numbers)</li>
        <li>Subscription plan and billing preferences</li>
        <li>Number of locations and operational configuration</li>
      </ul>

      <h3><span className="sub-num">2.2</span>Employee Information</h3>
      <p>Account administrators may enter and manage the following employee data through the Platform:</p>
      <ul>
        <li><strong>Personal information:</strong> full name, date of birth (where required), address, phone number, email address</li>
        <li><strong>Employment information:</strong> job title, department, location, start date, salary, employment status</li>
        <li><strong>Identification documents:</strong> government-issued ID, SSN (where required for employment records), work authorization documents</li>
        <li><strong>Certifications and licenses:</strong> Food Handler certifications, TABC certifications, and other professional licenses required for employment</li>
        <li><strong>Signed contracts:</strong> digitally signed employment agreements and other workplace documents</li>
        <li><strong>Performance and disciplinary records:</strong> incident logs, performance reviews, disciplinary actions, and time-off records</li>
        <li><strong>Photographs:</strong> employee profile photos uploaded by administrators or employees</li>
      </ul>

      <h3><span className="sub-num">2.3</span>Operational Data</h3>
      <p>The Platform collects and stores operational data entered by users, including:</p>
      <ul>
        <li>Shift communication logs, checklists, and task completion records</li>
        <li>Equipment maintenance logs and incident reports</li>
        <li>Supplier and vendor directory information</li>
        <li>Document uploads and file attachments</li>
        <li>Checklist responses and audit trails</li>
      </ul>

      <h3><span className="sub-num">2.4</span>Communications Data</h3>
      <p>When you use the Platform&apos;s communication features, we collect and store:</p>
      <ul>
        <li>In-platform notification history</li>
        <li>Email communication logs (sent via Brevo)</li>
        <li>WhatsApp message logs (sent via ManyChat), for users who have provided explicit opt-in consent</li>
      </ul>

      <h3><span className="sub-num">2.5</span>Technical and Usage Data</h3>
      <p>Our systems automatically collect:</p>
      <ul>
        <li>IP addresses, browser type, device information, and operating system</li>
        <li>Session data, login timestamps, and activity logs</li>
        <li>Feature usage and navigation patterns within the Platform</li>
        <li>Error logs and performance metrics</li>
      </ul>

      <h2><span className="section-num">3.</span>How We Use Information</h2>
      <p>We use the information collected for the following purposes:</p>
      <ol>
        <li><strong>Service delivery:</strong> to provide all Platform features, including employee management, operations tools, document storage, scheduling, and communication;</li>
        <li><strong>AI-powered features:</strong> to generate operational reports, insights, and recommendations based on your data. We do not use your Customer Data to train general-purpose AI models without your explicit consent;</li>
        <li><strong>Notifications and communications:</strong> to send operational alerts, document expiration notices, checklist reminders, and service-related communications via in-app notifications, email (Brevo), and WhatsApp (ManyChat, with explicit opt-in);</li>
        <li><strong>Billing and account management:</strong> to process subscription payments, manage plan limits, and send billing-related communications;</li>
        <li><strong>Support and troubleshooting:</strong> to investigate issues you report and provide customer support;</li>
        <li><strong>Security:</strong> to detect, prevent, and respond to fraud, abuse, or unauthorized access;</li>
        <li><strong>Compliance:</strong> to comply with applicable laws, regulations, and court orders; and</li>
        <li><strong>Platform improvement:</strong> to analyze aggregated, anonymized usage data to improve Platform features and performance.</li>
      </ol>
      <p>We do <strong>not</strong> use your data for advertising, sale to third parties, or any purpose unrelated to providing and improving the Service.</p>

      <h2><span className="section-num">4.</span>Employee Data — Special Considerations</h2>

      <h3><span className="sub-num">4.1</span>Employer as Data Controller</h3>
      <p>Account administrators act as the data controller for their employees&apos; personal data entered into the Platform. GetBackplate acts as a data processor, processing employee data only on behalf of and under the instructions of the account administrator.</p>

      <h3><span className="sub-num">4.2</span>Employee Rights</h3>
      <p>Employees whose personal data is stored in the Platform may have rights under applicable law to access, correct, or delete their personal data. Employees should direct such requests to their employer (the account administrator) in the first instance. GetBackplate will cooperate with administrators in honoring lawful employee data requests.</p>

      <h3><span className="sub-num">4.3</span>Certification and License Data</h3>
      <p>Food Handler certifications, TABC certifications, and similar professional licenses are stored as employment records. This data is used solely to support compliance tracking within your organization and is not shared with any third party except as required by law or as directed by the account administrator.</p>

      <h3><span className="sub-num">4.4</span>Document Security</h3>
      <p>All documents uploaded to the Platform, including identification documents and signed contracts, are stored with encryption at rest and access controls that restrict viewing to authorized users within your organization.</p>

      <h2><span className="section-num">5.</span>How We Share Information</h2>

      <h3><span className="sub-num">5.1</span>With Third-Party Service Providers</h3>
      <p>We use the following infrastructure and service providers, which process data on our behalf:</p>
      <ul>
        <li><strong>Vercel Inc.</strong> — application hosting and serverless compute</li>
        <li><strong>Supabase Inc.</strong> — managed PostgreSQL database, file storage, and real-time services</li>
        <li><strong>Stripe Inc.</strong> — payment processing and subscription billing</li>
        <li><strong>Brevo (Sendinblue SAS)</strong> — transactional email delivery</li>
        <li><strong>ManyChat Inc.</strong> — WhatsApp messaging (only for users who have provided explicit opt-in consent)</li>
        <li><strong>Twilio Inc.</strong> — SMS and communication infrastructure</li>
        <li><strong>DocuSeal</strong> — digital contract signing</li>
        <li><strong>Sentry</strong> — error monitoring and performance tracking</li>
        <li><strong>Upstash</strong> — rate limiting and caching infrastructure</li>
        <li><strong>Anthropic</strong> — AI-powered features via Claude API</li>
      </ul>
      <p>These providers are contractually obligated to use your data only to provide their services to us and to maintain appropriate security safeguards.</p>

      <h3><span className="sub-num">5.2</span>Legal Disclosures</h3>
      <p>We may disclose information when required by law, subpoena, court order, or other legal process, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.</p>

      <h3><span className="sub-num">5.3</span>Business Transfers</h3>
      <p>If GetBackplate is involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction. We will notify affected users before any such transfer takes effect.</p>

      <h3><span className="sub-num">5.4</span>With Your Consent</h3>
      <p>We will share information for any other purpose only with your explicit consent.</p>
      <p>We do <strong>not</strong> sell or rent personal information to third parties.</p>

      <h2><span className="section-num">6.</span>Data Storage and Retention</h2>
      <ul>
        <li><strong>Account and business data</strong> is retained for the duration of your active subscription plus 90 days after termination, during which you may request a data export.</li>
        <li><strong>Employee records</strong> are retained as configured by the account administrator. Administrators may delete employee records at any time, subject to any legal retention requirements applicable to employment records in their jurisdiction.</li>
        <li><strong>Operational data</strong> (checklists, logs, shift communications) is retained for the duration of your subscription and deleted within 90 days after account termination.</li>
        <li><strong>Documents and file uploads</strong> are retained as configured by the account administrator. Deleted files are permanently removed from storage within 30 days.</li>
        <li><strong>Billing records</strong> are retained for seven (7) years as required for financial and tax compliance.</li>
        <li><strong>Technical logs</strong> (error logs, access logs) are retained for twelve (12) months.</li>
      </ul>
      <p>You may request export or deletion of your data at any time by contacting us at the address in Section 13.</p>

      <h2><span className="section-num">7.</span>Communications Consent and Preferences</h2>

      <h3><span className="sub-num">7.1</span>Email</h3>
      <p>By using the Platform, administrators and employees consent to receive transactional and operational emails related to their use of the Service. These may include document expiration alerts, checklist notifications, account updates, and billing communications. Users may manage notification preferences within the Platform settings.</p>

      <h3><span className="sub-num">7.2</span>WhatsApp</h3>
      <p>WhatsApp messaging is only activated upon express opt-in from the individual recipient. By opting in, you consent to receive operational notifications via WhatsApp through ManyChat. You may opt out at any time by responding STOP to any WhatsApp message or by updating your notification preferences in the Platform.</p>

      <h3><span className="sub-num">7.3</span>Marketing Communications</h3>
      <p>We do not send marketing communications without your separate, explicit consent. If you consent to marketing communications, you may withdraw that consent at any time.</p>

      <h2><span className="section-num">8.</span>Data Security</h2>
      <p>We implement industry-standard administrative, technical, and physical safeguards, including:</p>
      <ul>
        <li>TLS 1.2+ encryption for all data in transit</li>
        <li>Encryption at rest for all database records and stored files</li>
        <li>Row-level security controls ensuring each organization&apos;s data is isolated and inaccessible to other organizations on the Platform</li>
        <li>Role-based access controls within each organization</li>
        <li>Multi-factor authentication support for administrator accounts</li>
        <li>Regular software updates and dependency vulnerability scanning</li>
        <li>Error monitoring and anomaly detection via Sentry</li>
        <li>Rate limiting to prevent unauthorized bulk access</li>
      </ul>
      <p>Despite these measures, no method of transmission or storage is 100% secure. Please notify us immediately at the address in Section 13 if you suspect any unauthorized access to your account or data.</p>

      <h2><span className="section-num">9.</span>Data Isolation Between Organizations</h2>
      <p>The Platform is designed so that each organization&apos;s data is strictly isolated from all other organizations. Organizational data is segregated at the database level using row-level security policies. No organization can access the data of any other organization through normal use of the Platform.</p>

      <h2><span className="section-num">10.</span>Your Rights and Choices</h2>
      <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
      <ul>
        <li><strong>Access:</strong> request a copy of the personal information we hold about you</li>
        <li><strong>Correction:</strong> request that we correct inaccurate information</li>
        <li><strong>Deletion:</strong> request that we delete your personal information, subject to legal retention obligations</li>
        <li><strong>Restriction:</strong> request that we limit the processing of your information</li>
        <li><strong>Portability:</strong> request a copy of your information in a structured, machine-readable format</li>
        <li><strong>Objection:</strong> object to certain types of processing</li>
        <li><strong>Withdrawal of consent:</strong> withdraw any consent you previously provided</li>
      </ul>
      <p>To exercise these rights, contact us using the information in Section 13. We will respond within the timeframe required by applicable law (typically 30–45 days).</p>

      <h2><span className="section-num">11.</span>California Privacy Rights</h2>
      <p>If you are a California resident, the CCPA and CPRA provide additional rights, including the right to know what personal information is collected, to request deletion, and to opt out of the sale or sharing of personal information. We do not sell or share personal information as defined by these laws. To exercise your rights, contact us as described in Section 13.</p>

      <h2><span className="section-num">12.</span>Changes to This Privacy Policy</h2>
      <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the &quot;Last Updated&quot; date at the top and notify affected users by email or through the Platform. Your continued use of the Service after the effective date of any changes constitutes your acceptance of the revised Privacy Policy.</p>

      <h2><span className="section-num">13.</span>Contact Us</h2>
      <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:</p>
      <div className="contact-block">
        <strong>Backplate Technologies LLC, d/b/a GetBackplate — Privacy Officer</strong>
        1321 Upland Dr., Suite 9894<br />
        Houston, Texas 77043<br />
        United States<br />
        <a href="mailto:privacy@getbackplate.com">privacy@getbackplate.com</a> · +1 (956) 802-9639
      </div>
      <p style={{ marginTop: 28 }}>We will acknowledge your inquiry within a reasonable time and respond as required by applicable law.</p>
      <p>By using the Service, you confirm that you have read and understood this Privacy Policy and consent to the collection, use, and sharing of your information as described herein.</p>
    </LegalDocLayout>
  );
}
