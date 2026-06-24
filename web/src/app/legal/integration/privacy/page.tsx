import { LegalDocLayout } from "@/shared/ui/legal-doc-layout";

export const metadata = {
  title: "Privacy Policy | GetBackplate",
  description: "Privacy Policy for the GetBackplate QuickBooks Online to Restaurant365 integration.",
};

export default function IntegrationPrivacyPage() {
  return (
    <LegalDocLayout
      docLabel="Integration"
      title="Privacy Policy"
      subtitle="QuickBooks Online to Restaurant365 Integration"
      effective="July 23, 2026"
      lastUpdated="July 23, 2026"
      version="2026.07.23"
    >
      <h2><span className="section-num">1.</span>Introduction</h2>
      <p>This Privacy Policy explains how <strong>Backplate Technologies LLC</strong>, a Texas limited liability company, doing business as <strong>GetBackplate</strong> (&quot;GetBackplate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, stores, shares, and protects information when you use our middleware integration that connects QuickBooks Online (&quot;QBO&quot;) with Restaurant365 (&quot;R365&quot;) (the &quot;Service&quot; or &quot;Application&quot;).</p>
      <p>GetBackplate is headquartered at 1321 Upland Dr., Suite 9894, Houston, Texas 77043, United States.</p>
      <p>This Privacy Policy applies to all users of the Service. By using the Service, you consent to the practices described in this Policy. If you do not agree, you must not use the Service.</p>
      <p>This Privacy Policy is intended to comply with the disclosure requirements of the Intuit Developer Program, applicable U.S. state privacy laws (including the California Consumer Privacy Act, where applicable), and other relevant data protection regulations.</p>

      <h2><span className="section-num">2.</span>Information We Collect</h2>

      <h3><span className="sub-num">2.1</span>Information You Provide</h3>
      <p>When you register or are authorized to use the Service, we may collect:</p>
      <ul>
        <li><strong>Contact information:</strong> name, business name, email address, phone number.</li>
        <li><strong>Account credentials:</strong> OAuth 2.0 authorization tokens granted by you through QuickBooks Online (we do <strong>not</strong> receive or store your QBO username or password).</li>
        <li><strong>Configuration data:</strong> Restaurant365 FTP endpoint details, field-mapping preferences, and delivery schedules that you or your administrator provide.</li>
      </ul>

      <h3><span className="sub-num">2.2</span>Information We Access From QuickBooks Online</h3>
      <p>When you authorize the Application via Intuit&apos;s OAuth flow, the Service accesses the following data from your QBO company file, limited to scopes you have approved:</p>
      <ul>
        <li>Invoice records (invoice number, date, due date, status, totals, taxes, terms)</li>
        <li>Customer records associated with invoices (name, billing address, contact information)</li>
        <li>Customer Account Number assigned in QuickBooks Online, used as the cross-reference identifier for the corresponding vendor record in Restaurant365</li>
        <li>Line-item detail (item description, quantity, unit price, account, class, location)</li>
        <li>Vendor and company profile data needed for proper accounting categorization</li>
        <li>Tax codes, payment terms, and currency settings</li>
      </ul>
      <p>We access this data <strong>only</strong> to perform the integration&apos;s stated purpose: transforming and delivering invoice data to your designated Restaurant365 FTP endpoint.</p>
      <p>We do <strong>not</strong> access, collect, or process:</p>
      <ul>
        <li>QBO usernames, passwords, or other login credentials</li>
        <li>Payroll or employee personal information beyond what may be incidentally referenced on an invoice</li>
        <li>Bank account or credit card numbers</li>
        <li>Social Security Numbers or other government identifiers</li>
      </ul>

      <h3><span className="sub-num">2.3</span>Information Generated Automatically</h3>
      <p>When the Service runs, our systems automatically log:</p>
      <ul>
        <li><strong>Operational data:</strong> webhook events, job timestamps, processing duration, success/failure status, error messages.</li>
        <li><strong>Technical data:</strong> IP addresses, request headers, API response codes from Intuit and Restaurant365.</li>
        <li><strong>Backup artifacts:</strong> copies of generated CSV/TXT files transmitted to Restaurant365, retained for audit and recovery purposes.</li>
      </ul>

      <h2><span className="section-num">3.</span>How We Use Information</h2>
      <p>We use the information collected for the following purposes:</p>
      <ol>
        <li><strong>Service delivery:</strong> to retrieve QBO invoices, transform them into Restaurant365-compatible formats (CSV, TXT, or EDI 810), and deliver them to your designated FTP endpoint;</li>
        <li><strong>Operational monitoring:</strong> to log job execution, detect errors, alert on failures, and maintain service reliability;</li>
        <li><strong>Support and troubleshooting:</strong> to investigate issues you or your counterparty report;</li>
        <li><strong>Security:</strong> to detect, prevent, and respond to fraud, abuse, or unauthorized access;</li>
        <li><strong>Compliance:</strong> to comply with applicable laws, regulations, court orders, and Intuit Developer Program requirements; and</li>
        <li><strong>Communication:</strong> to send service-related notices, security alerts, and administrative messages.</li>
      </ol>
      <p>We do <strong>not</strong> use your QBO data for advertising, marketing, profiling, training of artificial intelligence models, or any purpose unrelated to providing the Service.</p>

      <h2><span className="section-num">4.</span>How We Share Information</h2>
      <p>We share information only as described below:</p>

      <h3><span className="sub-num">4.1</span>With Restaurant365</h3>
      <p>The core function of the Service is to transmit transformed invoice data to a Restaurant365 FTP endpoint that you or your authorized counterparty have designated. By using the Service, you authorize this transmission.</p>

      <h3><span className="sub-num">4.2</span>With Service Providers</h3>
      <p>We use the following third-party infrastructure providers, which process data on our behalf under their own privacy and security commitments:</p>
      <ul>
        <li><strong>Vercel Inc.</strong> — application hosting and serverless compute.</li>
        <li><strong>Supabase Inc.</strong> — managed PostgreSQL database (job logs), object storage (CSV backups), and edge function execution.</li>
        <li><strong>Intuit Inc.</strong> — source platform for invoice data via the Intuit Developer API.</li>
      </ul>
      <p>These providers are contractually obligated to use the data only to provide their services to us and to maintain appropriate security safeguards.</p>

      <h3><span className="sub-num">4.3</span>Legal Disclosures</h3>
      <p>We may disclose information when required by law, subpoena, court order, or other legal process, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others, investigate fraud, or respond to a government request.</p>

      <h3><span className="sub-num">4.4</span>Business Transfers</h3>
      <p>If GetBackplate is involved in a merger, acquisition, financing, or sale of assets, information may be transferred as part of that transaction. We will notify affected users before any such transfer takes effect.</p>

      <h3><span className="sub-num">4.5</span>With Your Consent</h3>
      <p>We will share information for any other purpose only with your explicit consent.</p>
      <p>We do <strong>not</strong> sell or rent personal information to third parties.</p>

      <h2><span className="section-num">5.</span>Data Storage and Retention</h2>
      <ul>
        <li><strong>OAuth tokens</strong> are stored encrypted at rest in our database and refreshed automatically according to Intuit&apos;s token lifecycle. Tokens are deleted within 30 days after disconnection.</li>
        <li><strong>Operational logs</strong> (job execution records, error messages) are retained for up to <strong>twelve (12) months</strong> for monitoring, audit, and troubleshooting purposes.</li>
        <li><strong>CSV/TXT backup files</strong> delivered to Restaurant365 are retained in Supabase Storage for up to <strong>twelve (12) months</strong> to support recovery, dispute resolution, and audit needs.</li>
        <li><strong>Account and configuration data</strong> is retained for the duration of your active use of the Service plus a reasonable period thereafter for legal and accounting compliance.</li>
      </ul>
      <p>You may request earlier deletion of your data at any time, subject to legal retention requirements (see Section 7).</p>

      <h2><span className="section-num">6.</span>Data Security</h2>
      <p>We implement industry-standard administrative, technical, and physical safeguards designed to protect information against unauthorized access, alteration, disclosure, or destruction, including:</p>
      <ul>
        <li>TLS 1.2+ encryption for all data in transit between QBO, GetBackplate, and Restaurant365 (FTP transmission uses encrypted channels where supported by the receiving endpoint).</li>
        <li>Encryption at rest for stored OAuth tokens and database records.</li>
        <li>Role-based access controls for personnel.</li>
        <li>Logging and monitoring of administrative access.</li>
        <li>Regular software updates and dependency vulnerability scanning.</li>
        <li>Principle of least privilege for service-account permissions.</li>
      </ul>
      <p>Despite these measures, no method of transmission or storage is 100% secure. We cannot guarantee absolute security. You should notify us immediately at the contact below if you suspect any unauthorized access to your data.</p>

      <h2><span className="section-num">7.</span>Your Rights and Choices</h2>
      <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
      <ul>
        <li><strong>Access:</strong> request a copy of the personal information we hold about you.</li>
        <li><strong>Correction:</strong> request that we correct inaccurate information.</li>
        <li><strong>Deletion:</strong> request that we delete your personal information, subject to legal retention obligations.</li>
        <li><strong>Restriction:</strong> request that we limit the processing of your information.</li>
        <li><strong>Portability:</strong> request a copy of your information in a structured, machine-readable format.</li>
        <li><strong>Objection:</strong> object to certain types of processing.</li>
        <li><strong>Withdrawal of consent:</strong> withdraw any consent you previously provided.</li>
      </ul>
      <p>To exercise these rights, contact us using the information in Section 12. We will respond within the timeframe required by applicable law (typically 30–45 days).</p>

      <h3><span className="sub-num">7.1</span>How to Disconnect the Application</h3>
      <p>You can revoke the Service&apos;s access to your QuickBooks Online data at any time:</p>
      <ol>
        <li>Log in to your QuickBooks Online account.</li>
        <li>Navigate to <strong>Settings (gear icon) → Apps → Connected Apps</strong>.</li>
        <li>Locate <strong>GetBackplate</strong> in the list.</li>
        <li>Click <strong>Disconnect</strong> and confirm.</li>
      </ol>
      <p>Once disconnected, the Service will no longer be able to access your QBO data. Cached operational data will be deleted in accordance with the retention schedule in Section 5, or sooner upon written request.</p>

      <h2><span className="section-num">8.</span>International Data Transfers</h2>
      <p>The Service is hosted and operated in the United States. If you access the Service from outside the United States, your information will be transferred to, stored, and processed in the United States, which may have data protection laws different from those in your jurisdiction. By using the Service, you consent to such transfers.</p>

      <h2><span className="section-num">9.</span>Children&apos;s Privacy</h2>
      <p>The Service is intended for use by businesses and is not directed at children under 13 years of age. We do not knowingly collect personal information from children. If we learn we have collected information from a child under 13, we will delete it promptly.</p>

      <h2><span className="section-num">10.</span>California Privacy Rights</h2>
      <p>If you are a California resident, the California Consumer Privacy Act (CCPA) and the California Privacy Rights Act (CPRA) provide additional rights, including the right to know what personal information is collected, to request deletion, to opt out of &quot;sales&quot; or &quot;sharing&quot; of personal information (we do not sell or share personal information as defined by these laws), and to non-discrimination for exercising your rights. To exercise these rights, contact us as described in Section 12.</p>

      <h2><span className="section-num">11.</span>Changes to This Privacy Policy</h2>
      <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make material changes, we will update the &quot;Last Updated&quot; date at the top and, where appropriate, notify you by email or through the Service.</p>
      <p>Your continued use of the Service after the effective date of any changes constitutes your acceptance of the revised Privacy Policy.</p>

      <h2><span className="section-num">12.</span>Contact Us</h2>
      <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:</p>
      <div className="contact-block">
        <strong>Backplate Technologies LLC, d/b/a GetBackplate — Privacy Officer</strong>
        1321 Upland Dr., Suite 9894<br />
        Houston, Texas 77043<br />
        United States<br />
        <a href="mailto:privacy@getbackplate.com">privacy@getbackplate.com</a> · +1 (956) 802-9639
      </div>
      <p style={{ marginTop: 28 }}>We will acknowledge your inquiry within a reasonable time and respond as required by applicable law.</p>
      <p>This Privacy Policy is designed to meet the disclosure requirements of the Intuit Developer Program and applicable data protection laws. By using the Service, you confirm that you have read and understood this Privacy Policy.</p>
    </LegalDocLayout>
  );
}
