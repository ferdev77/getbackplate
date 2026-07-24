import Link from "next/link";
import { LegalDocLayout } from "@/shared/ui/legal-doc-layout";
import { LEGAL_ADDRESS } from "@/shared/lib/company-addresses";

export const metadata = {
  title: "Master Services Agreement — Integration | GetBackplate",
  description: "Master Services Agreement for the GetBackplate QuickBooks® Online to Restaurant365 integration subscription.",
};

export default function IntegrationMsaPage() {
  return (
    <LegalDocLayout
      docLabel="Integration · Subscription"
      title="Master Services Agreement"
      subtitle="QuickBooks® Online to Restaurant365 Integration"
      effective="July 23, 2026"
      lastUpdated="July 19, 2026"
      version="2026.07.23"
    >
      <div className="preamble">
        This Master Services Agreement (the <strong>&quot;Agreement&quot;</strong>) governs your subscription to the Service. By checking the acceptance box during Stripe Checkout or otherwise affirmatively accepting these terms via Provider&apos;s electronic acceptance mechanism (the <strong>&quot;Acceptance Date&quot;</strong>), you agree to be bound by this Agreement.
      </div>

      <p>This Agreement is entered into by and between <strong>Backplate Technologies LLC</strong>, a Texas limited liability company, doing business as <strong>GetBackplate</strong>, located at {LEGAL_ADDRESS.inlineWithCountry} (hereinafter referred to as <strong>&quot;GetBackplate&quot;</strong> or <strong>&quot;Provider&quot;</strong>), and the legal entity identified during electronic acceptance and on whose behalf the individual completing checkout represents and warrants they have authority to bind (hereinafter referred to as <strong>&quot;Customer&quot;</strong>).</p>

      <p>GetBackplate and Customer are sometimes referred to herein individually as a <em>&quot;Party&quot;</em> and collectively as the <em>&quot;Parties.&quot;</em></p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Recitals</h2>
      <p><strong>WHEREAS,</strong> Provider operates a software-as-a-service platform that automates the delivery of invoices and credit memos from QuickBooks® Online to Restaurant365 via secure file transfer (the &quot;Platform&quot; or &quot;Service&quot;);</p>
      <p><strong>WHEREAS,</strong> Customer wishes to subscribe to and use the Service to deliver invoices and credit memos to its customers who use Restaurant365; and</p>
      <p><strong>WHEREAS,</strong> the Parties wish to formalize the terms and conditions governing their relationship.</p>
      <p><strong>NOW, THEREFORE,</strong> in consideration of the mutual covenants and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:</p>

      <h2><span className="section-num">1.</span>Definitions</h2>
      <h3><span className="sub-num">1.1</span>Customer Data</h3>
      <p>&quot;Customer Data&quot; means all data, information, and content submitted by Customer to or processed by the Service, including without limitation invoice and credit memo data retrieved from Customer&apos;s QuickBooks® Online account.</p>
      <h3><span className="sub-num">1.2</span>Documentation</h3>
      <p>&quot;Documentation&quot; means user manuals, technical documentation, and other written materials provided by Provider to Customer regarding the Service.</p>
      <h3><span className="sub-num">1.3</span>Acceptance Date</h3>
      <p>&quot;Acceptance Date&quot; has the meaning set forth in the preamble.</p>
      <h3><span className="sub-num">1.4</span>Service</h3>
      <p>&quot;Service&quot; or &quot;Platform&quot; means Provider&apos;s proprietary software-as-a-service platform that integrates QuickBooks® Online with Restaurant365 for the automated delivery of invoices and credit memos, as more particularly described in Schedule A.</p>
      <h3><span className="sub-num">1.5</span>Subscription Fee</h3>
      <p>&quot;Subscription Fee&quot; means the recurring monthly Base Subscription Fee and any Additional Connection Fees set forth in Schedule B.</p>
      <h3><span className="sub-num">1.6</span>Usage Fee</h3>
      <p>&quot;Usage Fee&quot; means the per-document fee charged for each successfully delivered invoice or credit memo, as set forth in Schedule B.</p>

      <h2><span className="section-num">2.</span>Services</h2>
      <h3><span className="sub-num">2.1</span>Scope</h3>
      <p>During the Term, Provider shall provide Customer with access to and use of the Service as described in Schedule A.</p>
      <h3><span className="sub-num">2.2</span>Account access</h3>
      <p>Customer shall designate one or more authorized users to access the Service. Customer is responsible for maintaining the confidentiality of all credentials and for all activities that occur under such credentials.</p>
      <h3><span className="sub-num">2.3</span>Modifications</h3>
      <p>Provider reserves the right to modify, enhance, or update the Service from time to time, provided that no such modification shall materially diminish the core functionality of the Service.</p>

      <h2><span className="section-num">3.</span>Term and termination</h2>
      <h3><span className="sub-num">3.1</span>Term</h3>
      <p>This Agreement shall commence on the Acceptance Date and continue for the monthly or annual billing term selected by Customer until terminated in accordance with this Section 3.</p>
      <h3><span className="sub-num">3.2</span>Termination for convenience</h3>
      <p>Either Party may terminate this Agreement for convenience at any time upon thirty (30) days&apos; prior written notice to the other Party.</p>
      <h3><span className="sub-num">3.3</span>Termination for cause</h3>
      <p>Either Party may terminate this Agreement upon material breach by the other Party if such breach remains uncured thirty (30) days after written notice from the non-breaching Party.</p>
      <h3><span className="sub-num">3.4</span>Effect of termination</h3>
      <p>Upon termination: (a) Customer shall pay all fees accrued through the date of termination; (b) Customer&apos;s access to the Service shall cease; and (c) Provider shall, upon Customer&apos;s written request made within thirty (30) days of termination, return or destroy Customer Data in accordance with Section 7.</p>

      <h2><span className="section-num">4.</span>Fees and payment</h2>
      <h3><span className="sub-num">4.1</span>Fees</h3>
      <p>Customer shall pay Provider the fees set forth in Schedule B.</p>
      <h3><span className="sub-num">4.2</span>Billing</h3>
      <p>Subscription Fees shall be billed monthly or annually in advance, according to the billing term selected by Customer, via Stripe or such other payment processor as Provider may designate. Usage Fees are billed in arrears based on the volume of documents successfully delivered.</p>
      <h3><span className="sub-num">4.3</span>Payment method</h3>
      <p>Customer shall maintain a valid payment method on file with Provider&apos;s payment processor and authorizes Provider to charge such method automatically for fees due hereunder.</p>
      <h3><span className="sub-num">4.4</span>Late payment</h3>
      <p>If any payment is more than fifteen (15) days past due, Provider may, after providing written notice, suspend the Service until payment is received. Suspension does not relieve Customer of its payment obligations. Past-due amounts shall accrue interest at the lesser of one and one-half percent (1.5%) per month or the maximum rate permitted by law.</p>
      <h3><span className="sub-num">4.5</span>Taxes</h3>
      <p>All fees, including without limitation Subscription Fees, Additional Connection Fees, and Usage Fees, are exclusive of taxes. Customer is responsible for all applicable sales, use, value-added, or similar taxes assessed on the Service or on any fee component, excluding taxes on Provider&apos;s net income. Provider will collect and remit applicable taxes via Stripe Tax based on Customer&apos;s billing jurisdiction.</p>
      <h3><span className="sub-num">4.6</span>Fee changes</h3>
      <p>Provider may change fees with sixty (60) days&apos; prior written notice to Customer, with such changes effective at the start of the billing period following the notice period.</p>

      <h2><span className="section-num">5.</span>Service level agreement</h2>
      <h3><span className="sub-num">5.1</span>Uptime target</h3>
      <p>Provider shall use commercially reasonable efforts to maintain Service availability of ninety-nine and five-tenths percent (99.5%) measured monthly.</p>
      <h3><span className="sub-num">5.2</span>Exclusions</h3>
      <p>The uptime target excludes downtime caused by: (a) scheduled maintenance with at least 24 hours&apos; prior notice; (b) emergency maintenance; (c) outages of third-party services including but not limited to Intuit QuickBooks® Online, Restaurant365, or other dependencies outside Provider&apos;s control; (d) Customer&apos;s acts or omissions; and (e) force majeure events as described in Section 14.</p>
      <h3><span className="sub-num">5.3</span>Service credits</h3>
      <p>If Provider fails to meet the uptime target in any given month, Customer&apos;s sole and exclusive remedy shall be a service credit equal to five percent (5%) of the Base Subscription Fee for that month for each full percentage point below the uptime target, capped at one hundred percent (100%) of that month&apos;s Base Subscription Fee. Customer must request service credits in writing within thirty (30) days following the affected month.</p>
      <h3><span className="sub-num">5.4</span>Support</h3>
      <p>Provider shall provide email support during business hours (Monday through Friday, 9:00 AM to 5:00 PM Central Time, excluding U.S. federal holidays) with the following response time targets: Critical issues (Service unavailable): four (4) business hours; High priority issues: one (1) business day; Other issues: three (3) business days.</p>

      <h2><span className="section-num">6.</span>Customer responsibilities</h2>
        <h3><span className="sub-num">6.1</span>QuickBooks® Online connection</h3>
        <p>Customer shall maintain a valid OAuth connection between its QuickBooks® Online account and the Service. Customer shall re-authenticate the connection upon request from Provider or when required by Intuit.</p>
      <h3><span className="sub-num">6.2</span>Account Number management</h3>
        <p>Customer is responsible for maintaining accurate Account Number assignments at the customer profile level in QuickBooks® Online for each Restaurant365 customer to whom invoices are to be delivered through the Service.</p>
      <h3><span className="sub-num">6.3</span>Invoice sending</h3>
        <p>Customer acknowledges that the Service is triggered by Customer&apos;s affirmative action of sending invoices and credit memos via the QuickBooks® Online &quot;Send&quot; function. Documents that are created and saved in QuickBooks® Online but not sent (i.e., documents with EmailStatus of &quot;NotSet&quot;) will not be delivered through the Service. Customer is solely responsible for sending documents through the QuickBooks® Online &quot;Send&quot; function.</p>
      <h3><span className="sub-num">6.4</span>Notification of issues</h3>
      <p>Customer shall promptly notify Provider of any suspected issues with the Service, including without limitation documents that fail to deliver or appear to be missing on the receiving end.</p>
      <h3><span className="sub-num">6.5</span>Compliance</h3>
      <p>Customer shall comply with all applicable laws and regulations in its use of the Service and in the content of any documents transmitted through the Service.</p>

      <h2><span className="section-num">7.</span>Data and privacy</h2>
      <h3><span className="sub-num">7.1</span>Customer Data ownership</h3>
      <p>As between the Parties, Customer retains all right, title, and interest in and to Customer Data.</p>
      <h3><span className="sub-num">7.2</span>Use of Customer Data</h3>
      <p>Provider shall use Customer Data solely for the purpose of providing the Service to Customer and as otherwise permitted by this Agreement.</p>
      <h3><span className="sub-num">7.3</span>Privacy Policy</h3>
      <p>Provider&apos;s collection, use, and storage of Customer Data is further described in its Privacy Policy available at <Link href="/legal/integration/privacy">getbackplate.com/legal/integration/privacy</Link>, as may be updated from time to time.</p>
      <h3><span className="sub-num">7.4</span>Data retention</h3>
      <p>Provider retains operational processing data, webhook payloads, detailed transformation records, and delivery logs for up to twelve (12) months. Fiscal records, billing evidence, and contract acceptance records are retained for as long as required for tax, accounting, dispute, or legal compliance. Generated CSV content is not retained by Provider after transmission.</p>
      <h3><span className="sub-num">7.5</span>Data return and deletion</h3>
      <p>Upon termination, Provider shall, upon Customer&apos;s written request made within thirty (30) days of termination, return or destroy Customer Data within an additional thirty (30) days thereafter, except where retention is required by applicable law or for legitimate business purposes.</p>
      <h3><span className="sub-num">7.6</span>Security</h3>
      <p>Provider shall implement and maintain commercially reasonable administrative, technical, and physical safeguards designed to protect Customer Data from unauthorized access, disclosure, alteration, or destruction.</p>

      <h2><span className="section-num">8.</span>Confidentiality</h2>
      <h3><span className="sub-num">8.1</span>Definition</h3>
      <p>&quot;Confidential Information&quot; means any non-public information disclosed by one Party to the other in connection with this Agreement, whether disclosed orally, in writing, or electronically, that is identified as confidential or that a reasonable person would understand to be confidential under the circumstances.</p>
      <h3><span className="sub-num">8.2</span>Obligations</h3>
      <p>Each Party shall: (a) use Confidential Information only as necessary to perform its obligations under this Agreement; (b) protect Confidential Information using the same degree of care it uses to protect its own confidential information of a similar nature, but in no event less than reasonable care; and (c) not disclose Confidential Information to any third party except to its employees, contractors, and advisors with a need to know and who are bound by obligations of confidentiality at least as protective as those herein.</p>
      <h3><span className="sub-num">8.3</span>Exclusions</h3>
      <p>Confidential Information does not include information that: (a) is or becomes publicly known through no fault of the receiving Party; (b) was rightfully known by the receiving Party prior to disclosure; (c) is rightfully obtained from a third party without restriction; or (d) is independently developed by the receiving Party without use of or reference to the Confidential Information.</p>
      <h3><span className="sub-num">8.4</span>Survival</h3>
      <p>The obligations in this Section 8 shall survive termination of this Agreement for three (3) years.</p>

      <h2><span className="section-num">9.</span>Intellectual property</h2>
      <h3><span className="sub-num">9.1</span>Provider IP</h3>
      <p>Provider retains all right, title, and interest in and to the Service, Documentation, Platform code, methodologies, and all related intellectual property rights. Nothing in this Agreement transfers any ownership rights in the Service to Customer.</p>
      <h3><span className="sub-num">9.2</span>License grant</h3>
      <p>Subject to the terms and conditions of this Agreement, Provider grants Customer a non-exclusive, non-transferable, non-sublicensable license to use the Service during the Term solely for Customer&apos;s internal business purposes.</p>
      <h3><span className="sub-num">9.3</span>Feedback</h3>
      <p>Customer may from time to time provide suggestions, comments, or other feedback regarding the Service (&quot;Feedback&quot;). Provider may use Feedback without obligation or compensation, and Customer hereby assigns to Provider all right, title, and interest in and to any Feedback.</p>

      <h2><span className="section-num">10.</span>Warranties and disclaimers</h2>
      <h3><span className="sub-num">10.1</span>Limited warranty</h3>
      <p>Provider warrants that it will perform the Service using commercially reasonable efforts in a professional manner consistent with industry standards for similar services.</p>
      <h3><span className="sub-num">10.2</span>Disclaimer</h3>
      <p className="uppercase-clause">Except as expressly set forth in this Agreement, the Service is provided &quot;as is&quot; and &quot;as available.&quot; Provider disclaims all other warranties, whether express, implied, or statutory, including without limitation implied warranties of merchantability, fitness for a particular purpose, and non-infringement. Provider does not warrant that the Service will be uninterrupted or error-free.</p>

      <h2><span className="section-num">11.</span>Limitation of liability</h2>
      <h3><span className="sub-num">11.1</span>Cap</h3>
      <p className="uppercase-clause">In no event shall Provider&apos;s total cumulative liability arising out of or related to this Agreement exceed the total fees paid by Customer to Provider in the twelve (12) months immediately preceding the event giving rise to liability.</p>
      <h3><span className="sub-num">11.2</span>Excluded damages</h3>
      <p className="uppercase-clause">In no event shall either Party be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, or data, even if advised of the possibility of such damages.</p>
      <h3><span className="sub-num">11.3</span>Exceptions</h3>
      <p>The limitations set forth in this Section 11 do not apply to: (a) breaches of confidentiality obligations under Section 8; (b) Customer&apos;s payment obligations under Section 4; (c) indemnification obligations under Section 12; or (d) liability arising from a Party&apos;s gross negligence or willful misconduct.</p>

      <h2><span className="section-num">12.</span>Indemnification</h2>
      <h3><span className="sub-num">12.1</span>By Provider</h3>
      <p>Provider shall defend, indemnify, and hold harmless Customer from third-party claims alleging that the Service, as provided by Provider and used by Customer in accordance with this Agreement, infringes any third party&apos;s intellectual property rights.</p>
      <h3><span className="sub-num">12.2</span>By Customer</h3>
      <p>Customer shall defend, indemnify, and hold harmless Provider from third-party claims arising from: (a) Customer Data; (b) Customer&apos;s breach of this Agreement; or (c) Customer&apos;s negligence or willful misconduct.</p>
      <h3><span className="sub-num">12.3</span>Procedure</h3>
      <p>The indemnified Party shall promptly notify the indemnifying Party of any claim, provide reasonable cooperation in the defense, and allow the indemnifying Party sole control of the defense and settlement, provided that no settlement that imposes any obligation or admission on the indemnified Party shall be entered without the indemnified Party&apos;s prior written consent.</p>

      <h2><span className="section-num">13.</span>Insurance</h2>
      <p>Provider shall maintain during the Term, at its own expense: (a) Technology Errors &amp; Omissions insurance with limits of not less than One Million U.S. Dollars ($1,000,000) per occurrence and Two Million U.S. Dollars ($2,000,000) in the aggregate; and (b) Cyber Liability insurance with limits of not less than One Million U.S. Dollars ($1,000,000) per occurrence and Two Million U.S. Dollars ($2,000,000) in the aggregate. Upon written request from Customer, Provider shall provide certificates of insurance evidencing such coverage.</p>

      <h2><span className="section-num">14.</span>Force majeure</h2>
      <p>Neither Party shall be liable for any failure or delay in performance under this Agreement due to causes beyond its reasonable control, including without limitation acts of God, war, terrorism, civil unrest, government actions, pandemics, epidemics, internet or telecommunications failures, or outages of third-party services. The affected Party shall promptly notify the other and use reasonable efforts to mitigate the effects.</p>

      <h2><span className="section-num">15.</span>Governing law and dispute resolution</h2>
      <h3><span className="sub-num">15.1</span>Governing law</h3>
      <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of laws principles.</p>
      <h3><span className="sub-num">15.2</span>Dispute resolution</h3>
      <p>The Parties shall first attempt in good faith to resolve any dispute arising out of or relating to this Agreement through negotiation. If the dispute is not resolved within thirty (30) days of written notice of the dispute, it shall be finally resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, conducted in Harris County, Texas, in English. Judgment on the arbitration award may be entered in any court of competent jurisdiction.</p>
      <h3><span className="sub-num">15.3</span>Injunctive relief</h3>
      <p>Notwithstanding the foregoing, either Party may seek injunctive or other equitable relief in any court of competent jurisdiction to protect its intellectual property or Confidential Information.</p>

      <h2><span className="section-num">16.</span>Notices</h2>
      <p>All notices under this Agreement shall be in writing and delivered by email with confirmation of receipt, or by certified mail or recognized overnight courier. Notices to Provider shall be sent to <a href="mailto:security@getbackplate.com">security@getbackplate.com</a> with a copy to {LEGAL_ADDRESS.inline}. Notices to Customer shall be sent to the email address provided by Customer during electronic acceptance.</p>

      <h2><span className="section-num">17.</span>Miscellaneous</h2>
      <h3><span className="sub-num">17.1</span>Entire agreement</h3>
      <p>This Agreement, including all Schedules attached hereto, constitutes the entire agreement between the Parties and supersedes all prior agreements, whether written or oral, regarding the subject matter hereof.</p>
      <h3><span className="sub-num">17.2</span>Amendments</h3>
      <p>No amendment to this Agreement shall be effective unless in writing and signed by authorized representatives of both Parties, or accepted electronically by Customer in accordance with Provider&apos;s then-current electronic acceptance mechanism.</p>
      <h3><span className="sub-num">17.3</span>Severability</h3>
      <p>If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
      <h3><span className="sub-num">17.4</span>Assignment</h3>
      <p>Neither Party may assign this Agreement without the other Party&apos;s prior written consent, except that either Party may assign this Agreement to a successor in connection with a merger, acquisition, or sale of substantially all of its assets.</p>
      <h3><span className="sub-num">17.5</span>No waiver</h3>
      <p>The failure of either Party to enforce any provision of this Agreement shall not constitute a waiver of that provision or of any other provision.</p>
      <h3><span className="sub-num">17.6</span>Counterparts</h3>
      <p>This Agreement may be executed in counterparts, including by electronic acceptance, each of which shall be deemed an original and all of which together shall constitute one instrument.</p>
      <h3><span className="sub-num">17.7</span>Relationship of Parties</h3>
      <p>The Parties are independent contractors. Nothing in this Agreement creates any partnership, joint venture, agency, or employment relationship between them.</p>
      <h3><span className="sub-num">17.8</span>Survival</h3>
      <p>The following sections shall survive any termination or expiration of this Agreement: Section 7 (Data and Privacy), Section 8 (Confidentiality), Section 9 (Intellectual Property), Section 11 (Limitation of Liability), Section 12 (Indemnification), Section 15 (Governing Law and Dispute Resolution), and this Section 17 (Miscellaneous).</p>
      <h3><span className="sub-num">17.9</span>Language</h3>
      <p>This Agreement is executed and shall be interpreted in the English language. Any translations are provided for convenience only; the English version controls in the event of any conflict or inconsistency.</p>

      <h2><span className="section-num">18.</span>Electronic acceptance</h2>
      <h3><span className="sub-num">18.1</span>Acceptance mechanism</h3>
      <p>This Agreement is accepted electronically by Customer checking the agreement acceptance box during Stripe Checkout, by Customer&apos;s authorized representative clicking an &quot;I Agree&quot; button on Provider&apos;s website, or by Customer otherwise affirmatively accepting these terms via Provider&apos;s electronic acceptance system.</p>
      <h3><span className="sub-num">18.2</span>Authority</h3>
      <p>By accepting this Agreement, the individual completing checkout or otherwise providing acceptance represents and warrants that they are authorized to bind Customer to this Agreement.</p>
      <h3><span className="sub-num">18.3</span>Record of acceptance</h3>
      <p>Provider shall maintain the acceptance evidence made available by Stripe Checkout, including the date and time of acceptance, the version of this Agreement accepted, the Checkout Session identifier, and the customer email provided during checkout. Stripe does not provide the customer&apos;s acceptance IP address to Provider. The retained record constitutes Customer&apos;s electronic acceptance under the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state equivalents.</p>
      <h3><span className="sub-num">18.4</span>Additional connections</h3>
      <p>Customer may add additional R365 customer connections via Provider&apos;s dashboard or by request to Provider&apos;s support team. Each additional connection is billed at the rate set forth in Schedule B, and Customer&apos;s acceptance of this Agreement extends to such additional connections without additional formal acceptance required.</p>

      <div className="acceptance-block">
        <h2>Acceptance</h2>
        <p>This Agreement is accepted electronically through Provider&apos;s Stripe Checkout flow as described in Section 18. No physical signature is required.</p>

        <div className="party">
          <div className="party-label">Provider</div>
          <p><strong>Backplate Technologies LLC, d/b/a GetBackplate</strong><br />
          Authorized by: Angelo Ramos, Founder<br />
          Provider&apos;s acceptance is given by making the Service available to Customer via the electronic acceptance flow.</p>
        </div>

        <div className="party">
          <div className="party-label">Customer</div>
          <p>Accepted electronically on the Acceptance Date via Stripe Checkout.<br />
          Customer entity, billing details, and acceptance metadata are captured during checkout and retained by Provider in accordance with Section 18.3.</p>
        </div>
      </div>

      <div className="schedule">
        <div className="schedule-label">Schedule A</div>
        <h2>Description of Services</h2>
        <p>The Service provides the following functionality:</p>
        <ol>
          <li><strong>Webhook reception.</strong> The Service receives real-time event notifications from Intuit QuickBooks® Online via OAuth-authenticated webhooks for invoice and credit memo events.</li>
          <li><strong>Document processing.</strong> Upon receipt of an event indicating that an invoice or credit memo has been sent by Customer (EmailStatus = &quot;EmailSent&quot;), the Service retrieves the document data from QuickBooks® Online via API.</li>
          <li><strong>Format transformation.</strong> The Service transforms the document data into the Restaurant365 Multi-Invoice CSV format, mapping Customer&apos;s Account Numbers (as configured in QuickBooks® Online customer profiles) to the appropriate location identifiers in Restaurant365.</li>
          <li><strong>Delivery to R365.</strong> The Service uploads the formatted CSV file to the Restaurant365 FTP or FTPS endpoint configured for each of Customer&apos;s R365 customer relationships. FTPS uses TLS when enabled for that endpoint; SFTP is not currently supported.</li>
          <li><strong>Deduplication.</strong> The Service employs deduplication logic to ensure that each invoice or credit memo is delivered exactly once, even in the event of webhook retries or processing reattempts.</li>
          <li><strong>Retry logic.</strong> The Service implements retry logic for failed deliveries with progressive backoff intervals (5 minutes, 15 minutes, 1 hour, 4 hours, 24 hours) up to ten (10) total attempts before flagging a document as permanently failed.</li>
          <li><strong>Scheduled sweeps.</strong> The Service runs scheduled background jobs throughout the day to catch any documents missed by real-time webhooks.</li>
          <li><strong>Monitoring.</strong> The Service maintains internal monitoring of delivery status, with audit logs retained in accordance with Section 7 of the Agreement.</li>
        </ol>
      </div>

      <div className="schedule">
        <div className="schedule-label">Schedule B</div>
        <h2>Fees and Pricing</h2>
        <p>GetBackplate offers multiple subscription Plans (Connect, Grow, Scale, and Enterprise), each consisting of a Base Subscription Fee, a one-time Setup Fee, a number of included R365 customer connections, and a monthly allowance of Invoices and Credit Memos, with a per-document Overage Fee applicable above that allowance. Customer selects a Plan during Stripe Checkout; the fees for the selected Plan are confirmed at that time and are also published at <Link href="/integrations/qbo-r365">getbackplate.com/integrations/qbo-r365</Link>, which is incorporated herein by reference and controls in the event this Schedule B becomes out of date.</p>

        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Base Subscription Fee</th>
              <th>Setup Fee</th>
              <th>Included Connections / Invoices</th>
              <th>Overage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Connect</strong></td>
              <td>$269.00 USD / month</td>
              <td>$799.00 USD, one-time</td>
              <td>1 R365 connection · 75 invoices/mo</td>
              <td>+50-invoice pack for $39.00 USD, activated automatically when the monthly allowance is exceeded</td>
            </tr>
            <tr>
              <td><strong>Grow</strong></td>
              <td>$649.00 USD / month</td>
              <td>$2,099.00 USD, one-time</td>
              <td>Up to 3 R365 connections · 250 invoices/mo</td>
              <td>$0.79 USD per invoice or credit memo over 250</td>
            </tr>
            <tr>
              <td><strong>Scale</strong></td>
              <td>$1,199.00 USD / month</td>
              <td>$4,999.00 USD, one-time</td>
              <td>Up to 10 R365 connections · 1,000 invoices/mo</td>
              <td>$0.49 USD per invoice or credit memo over 1,000 (waived entirely under Annual Billing)</td>
            </tr>
            <tr>
              <td><strong>Enterprise</strong></td>
              <td>Custom — contact <a href="mailto:hello@getbackplate.com">hello@getbackplate.com</a></td>
              <td>Custom</td>
              <td>Unlimited connections and invoices</td>
              <td>N/A</td>
            </tr>
          </tbody>
        </table>

        <h3>Notes</h3>
        <ul>
          <li><strong>Annual Billing.</strong> Customer may elect Annual Billing for any Plan, under which Customer is charged ten (10) months of the Base Subscription Fee in exchange for twelve (12) months of Service, and the Setup Fee is discounted twenty-five percent (25%).</li>
          <li><strong>Additional connections.</strong> Customer may add R365 customer connections beyond the number included in their Plan for a one-time fee of $500.00 USD per additional connection plus a recurring fee of $99.00 USD per month per additional connection ($79.00 USD per month on the Scale Plan).</li>
          <li>Overage Fees apply to each unique Invoice or Credit Memo successfully delivered to R365 above the Plan&apos;s monthly allowance, regardless of the number of locations within a given R365 customer.</li>
          <li>Deduplication logic ensures that retries of the same document do not result in duplicate billing.</li>
          <li>Documents that fail to deliver and are flagged as permanently failed are not billed.</li>
          <li>All fees are exclusive of taxes. Applicable sales, use, value-added, or similar taxes are calculated and added at billing based on Customer&apos;s jurisdiction. The Service is treated as a taxable service in Texas and may be taxable in other jurisdictions.</li>
          <li>Fees are subject to change with sixty (60) days&apos; prior written notice in accordance with Section 4.6 of the Agreement.</li>
          <li>All fees are stated in U.S. Dollars.</li>
        </ul>

        <div className="pricing-example">
          <strong>Pricing example</strong>
          A Customer on the Grow Plan processing 300 invoices in a billing month would be billed as follows (pre-tax, monthly billing):
          <p>Base Subscription Fee (Grow): $649.00<br />
          Overage (50 × $0.79): $39.50</p>
          <div className="total">Subtotal: $688.50 (plus applicable taxes)</div>
        </div>
      </div>

      <p style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid var(--legal-border)", color: "var(--legal-text-muted)", fontSize: 14, textAlign: "center" }}>
        By accepting this Agreement electronically, Customer acknowledges that they have read, understood, and agreed to be bound by its terms and conditions.
      </p>
      <p style={{ marginTop: 8, color: "var(--legal-text-muted)", fontSize: 12, textAlign: "center" }}>
        QuickBooks® Online is a registered trademark of Intuit Inc. Restaurant365 is a trademark of Restaurant365, LLC. Backplate Technologies LLC (&quot;GetBackplate&quot;) is not affiliated with, endorsed by, or sponsored by Intuit Inc. or Restaurant365, LLC.
      </p>
    </LegalDocLayout>
  );
}
