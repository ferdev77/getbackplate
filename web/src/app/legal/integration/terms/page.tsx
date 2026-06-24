import Link from "next/link";
import { LegalDocLayout } from "@/shared/ui/legal-doc-layout";

export const metadata = {
  title: "End-User License Agreement | GetBackplate",
  description: "End-User License Agreement for the GetBackplate QuickBooks Online to Restaurant365 integration.",
};

export default function IntegrationTermsPage() {
  return (
    <LegalDocLayout
      docLabel="Integration"
      title="End-User License Agreement"
      subtitle="QuickBooks Online to Restaurant365 Integration"
      effective="July 23, 2026"
      lastUpdated="July 23, 2026"
      version="2026.07.23"
    >
      <h2><span className="section-num">1.</span>Acceptance of Terms</h2>
      <p>This End-User License Agreement (&quot;Agreement&quot; or &quot;EULA&quot;) is a binding legal agreement between you (&quot;User,&quot; &quot;Customer,&quot; &quot;you&quot;) and <strong>Backplate Technologies LLC</strong>, a Texas limited liability company, doing business as <strong>GetBackplate</strong> (&quot;GetBackplate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at 1321 Upland Dr., Suite 9894, Houston, Texas 77043, United States.</p>
      <p>By installing, accessing, authorizing, or using the GetBackplate QuickBooks Online to Restaurant365 integration software (the &quot;Service&quot; or &quot;Application&quot;), you acknowledge that you have read, understood, and agree to be bound by the terms of this Agreement. If you do not agree to these terms, you must not access or use the Service.</p>
      <p>If you are entering into this Agreement on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to this Agreement, in which case &quot;you&quot; refers to that entity.</p>
      <p>By accepting these Terms of Service, you also agree to be bound by our <Link href="/legal/integration/privacy">Privacy Policy</Link> and, if you subscribe to a paid plan, our <Link href="/legal/integration/msa">Master Services Agreement</Link>. The Privacy Policy and the Master Services Agreement are incorporated into this Agreement by reference and form part of the binding terms between you and GetBackplate.</p>

      <h2><span className="section-num">2.</span>Description of the Service</h2>
      <p>The GetBackplate Application is a middleware integration service that:</p>
      <ol>
        <li>Connects to a User&apos;s QuickBooks Online (&quot;QBO&quot;) account via the Intuit Developer API using OAuth 2.0 authorization;</li>
        <li>Retrieves invoice data and related financial records from the User&apos;s authorized QBO account;</li>
        <li>Transforms that data into a CSV, TXT, or EDI 810 format compatible with Restaurant365 (&quot;R365&quot;); and</li>
        <li>Delivers the transformed data to a designated Restaurant365 FTP endpoint specified by the User or their authorized counterparty.</li>
      </ol>
      <p>The Service operates as an automated, unattended data pipeline. The Service does not modify, create, or delete records within QuickBooks Online.</p>

      <h2><span className="section-num">3.</span>License Grant</h2>
      <p>Subject to your compliance with this Agreement, GetBackplate grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Service solely for your internal business purposes during the term of your authorized subscription or engagement.</p>
      <p>All rights not expressly granted to you in this Agreement are reserved by GetBackplate.</p>

      <h2><span className="section-num">4.</span>Restrictions on Use</h2>
      <p>You agree that you will not, and will not permit any third party to:</p>
      <ol>
        <li>Copy, modify, adapt, translate, reverse engineer, decompile, or disassemble the Service or any portion thereof;</li>
        <li>Create derivative works based on the Service;</li>
        <li>Rent, lease, lend, sell, sublicense, assign, distribute, publish, or otherwise transfer rights to the Service;</li>
        <li>Remove or alter any proprietary notices, labels, or marks on the Service;</li>
        <li>Use the Service to transmit unlawful, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable material;</li>
        <li>Use the Service to violate any applicable local, state, national, or international law or regulation, including but not limited to laws regarding the export of data or software;</li>
        <li>Attempt to gain unauthorized access to the Service, other accounts, computer systems, or networks connected to the Service through hacking, password mining, or any other means;</li>
        <li>Use the Service in any manner that could damage, disable, overburden, or impair GetBackplate&apos;s servers or networks; or</li>
        <li>Use the Service to access, store, or transmit any data for which you have not received express authorization from the data owner.</li>
      </ol>

      <h2><span className="section-num">5.</span>Third-Party Services</h2>
      <p>The Service depends on and integrates with third-party platforms, including:</p>
      <ul>
        <li><strong>Intuit QuickBooks Online</strong>, operated by Intuit Inc.</li>
        <li><strong>Restaurant365</strong>, operated by Restaurant365, LLC.</li>
        <li><strong>Vercel</strong>, operated by Vercel Inc., used for application hosting.</li>
        <li><strong>Supabase</strong>, operated by Supabase Inc., used for data storage and processing.</li>
      </ul>
      <p>You acknowledge that:</p>
      <ol>
        <li>Your use of QuickBooks Online and Restaurant365 is governed by separate agreements between you and those providers. GetBackplate is not responsible for the availability, accuracy, or terms of those third-party services.</li>
        <li>You must maintain valid, active accounts and credentials with the applicable third-party services for the Application to function.</li>
        <li>GetBackplate is not affiliated with, endorsed by, or sponsored by Intuit Inc. or Restaurant365, LLC.</li>
        <li>Changes, deprecations, or service interruptions in any third-party platform may affect the operation of the Service, and GetBackplate is not liable for any resulting downtime or data loss.</li>
      </ol>

      <h2><span className="section-num">6.</span>User Responsibilities</h2>
      <p>You are solely responsible for:</p>
      <ol>
        <li>Maintaining the confidentiality of your QuickBooks Online and Restaurant365 credentials and OAuth tokens;</li>
        <li>Ensuring you have lawful authority to access, transmit, and share the data processed by the Service;</li>
        <li>Verifying the accuracy of data transmitted by the Service;</li>
        <li>Reviewing all invoices and records delivered to Restaurant365 for correctness;</li>
        <li>Complying with all applicable tax, accounting, and recordkeeping regulations; and</li>
        <li>Promptly notifying GetBackplate of any unauthorized access or security incident affecting your use of the Service.</li>
      </ol>

      <h2><span className="section-num">7.</span>Fees and Payment</h2>
      <p>Use of the Service may be subject to fees as set forth in a separate written agreement, statement of work, or invoice between you and GetBackplate. All fees are due in accordance with the terms specified in the applicable agreement.</p>
      <p>GetBackplate reserves the right to suspend or terminate the Service for non-payment.</p>

      <h2><span className="section-num">8.</span>Intellectual Property</h2>
      <p>The Service, including all software, code, designs, documentation, and related materials, is the exclusive property of GetBackplate and is protected by United States and international copyright, trademark, and other intellectual property laws.</p>
      <p>This Agreement does not transfer any ownership rights to you. You retain ownership of all data processed by the Service (&quot;Customer Data&quot;), and you grant GetBackplate a limited license to access, store, and process Customer Data solely for the purpose of providing the Service.</p>

      <h2><span className="section-num">9.</span>Disclaimer of Warranties</h2>
      <p>The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranty of any kind, express or implied. To the fullest extent permitted by applicable law, GetBackplate disclaims all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranties arising out of course of dealing or usage of trade.</p>
      <p>GetBackplate does not warrant that the Service will be uninterrupted, error-free, secure, or free of viruses or other harmful components, or that any defects will be corrected.</p>
      <p>You acknowledge that the Service transmits financial data and that you are solely responsible for verifying all transmitted data for accuracy.</p>

      <h2><span className="section-num">10.</span>Limitation of Liability</h2>
      <p>To the fullest extent permitted by applicable law, in no event shall GetBackplate, its officers, directors, employees, agents, or affiliates be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to loss of profits, revenue, data, goodwill, or business opportunity, arising out of or in connection with your use of or inability to use the Service, even if GetBackplate has been advised of the possibility of such damages.</p>
      <p>GetBackplate&apos;s total cumulative liability arising out of or relating to this Agreement shall not exceed the total fees paid by you to GetBackplate for the Service during the twelve (12) months preceding the event giving rise to the claim, or one hundred U.S. dollars (USD $100), whichever is greater.</p>

      <h2><span className="section-num">11.</span>Indemnification</h2>
      <p>You agree to defend, indemnify, and hold harmless GetBackplate, its officers, directors, employees, contractors, and affiliates from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable attorneys&apos; fees) arising out of or in any way connected with:</p>
      <ol>
        <li>Your access to or use of the Service;</li>
        <li>Your violation of any term of this Agreement;</li>
        <li>Your violation of any third-party right, including without limitation any intellectual property or privacy right;</li>
        <li>Your violation of any applicable law or regulation; or</li>
        <li>Any inaccuracy, error, or unauthorized transmission of data through your use of the Service.</li>
      </ol>

      <h2><span className="section-num">12.</span>Term and Termination</h2>
      <p>This Agreement is effective as of the date you first access the Service and continues until terminated by either party.</p>
      <p>You may terminate this Agreement at any time by:</p>
      <ol>
        <li>Revoking the Application&apos;s authorization within your QuickBooks Online account (Settings → Apps → Connected Apps → Disconnect); and</li>
        <li>Discontinuing all use of the Service.</li>
      </ol>
      <p>GetBackplate may suspend or terminate this Agreement immediately, with or without notice, if you breach any provision of this Agreement, if required by law, or if GetBackplate ceases to offer the Service.</p>
      <p>Upon termination, your right to use the Service immediately ceases. Sections 4, 8, 9, 10, 11, 14, and 15 will survive termination.</p>

      <h2><span className="section-num">13.</span>Modifications to the Service or Agreement</h2>
      <p>GetBackplate reserves the right to modify, suspend, or discontinue the Service, in whole or in part, at any time with or without notice.</p>
      <p>GetBackplate may amend this Agreement from time to time. The most current version will be posted at the URL where you obtained this Agreement, with a revised &quot;Last Updated&quot; date. Continued use of the Service after changes constitutes acceptance of the revised Agreement. If you do not agree to the changes, you must stop using the Service.</p>

      <h2><span className="section-num">14.</span>Governing Law and Dispute Resolution</h2>
      <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, United States, without regard to its conflict-of-laws principles.</p>
      <p>Any dispute arising out of or relating to this Agreement shall be brought exclusively in the state or federal courts located in Harris County, Texas, and you consent to the personal jurisdiction of such courts.</p>

      <h2><span className="section-num">15.</span>General Provisions</h2>
      <p><strong>Entire Agreement.</strong> This Agreement, together with any separate written agreements between you and GetBackplate, constitutes the entire agreement between the parties regarding the Service.</p>
      <p><strong>Severability.</strong> If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
      <p><strong>Waiver.</strong> No waiver of any term shall be deemed a further or continuing waiver of such term or any other term.</p>
      <p><strong>Assignment.</strong> You may not assign or transfer this Agreement without GetBackplate&apos;s prior written consent. GetBackplate may assign this Agreement freely.</p>
      <p><strong>Force Majeure.</strong> GetBackplate shall not be liable for any failure to perform due to causes beyond its reasonable control.</p>

      <h2><span className="section-num">16.</span>Regulated Industries</h2>
      <p>If you operate in or serve clients in a regulated industry — including but not limited to healthcare, government, education, alcohol distribution, or any sector subject to sector-specific data handling requirements — you are solely responsible for ensuring that your use of the Service complies with all applicable regulations governing your industry.</p>
      <ul>
        <li><strong>Healthcare:</strong> If any data processed by the Service is associated with covered entities or business associates under the Health Insurance Portability and Accountability Act (HIPAA), you must contact GetBackplate prior to use. The Service is not HIPAA-compliant by default, and use without an executed Business Associate Agreement (BAA) is prohibited.</li>
        <li><strong>Government and Education:</strong> If you are a government entity or educational institution subject to data retention, public records, or audit requirements, you are responsible for ensuring that the Service&apos;s data handling and retention practices meet your applicable obligations.</li>
        <li><strong>Alcohol and Beverage Distribution:</strong> If you are subject to TTB (Alcohol and Tobacco Tax and Trade Bureau) recordkeeping requirements, you remain solely responsible for maintaining compliant records independent of the Service.</li>
      </ul>
      <p>GetBackplate reserves the right to require additional agreements or to decline service to entities in regulated industries where compliance cannot be assured.</p>

      <h2><span className="section-num">17.</span>Contact Information</h2>
      <p>For questions regarding this Agreement, please contact:</p>
      <div className="contact-block">
        <strong>Backplate Technologies LLC, d/b/a GetBackplate</strong>
        1321 Upland Dr., Suite 9894<br />
        Houston, Texas 77043<br />
        United States<br />
        <a href="mailto:angelo@getbackplate.com">angelo@getbackplate.com</a> · +1 (956) 802-9639
      </div>
      <p style={{ marginTop: 28 }}>By using the Service, you acknowledge that you have read this Agreement, understand it, and agree to be bound by its terms and conditions.</p>
    </LegalDocLayout>
  );
}
