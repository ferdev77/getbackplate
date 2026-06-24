import Link from "next/link";
import { LegalDocLayout } from "@/shared/ui/legal-doc-layout";

export const metadata = {
  title: "End-User License Agreement | GetBackplate Platform",
  description: "End-User License Agreement for the GetBackplate Restaurant Operations Management Platform.",
};

export default function PlatformTermsPage() {
  return (
    <LegalDocLayout
      docLabel="Operations Platform"
      title="End-User License Agreement"
      subtitle="GetBackplate Restaurant Operations Management Platform"
      effective="July 23, 2026"
      lastUpdated="July 23, 2026"
      version="2026.07.23"
    >
      <h2><span className="section-num">1.</span>Acceptance of Terms</h2>
      <p>This End-User License Agreement (&quot;Agreement&quot; or &quot;EULA&quot;) is a binding legal agreement between you (&quot;User,&quot; &quot;Customer,&quot; &quot;you&quot;) and <strong>Backplate Technologies LLC</strong>, a Texas limited liability company, doing business as <strong>GetBackplate</strong> (&quot;GetBackplate,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at 1321 Upland Dr., Suite 9894, Houston, Texas 77043, United States.</p>
      <p>By registering for, accessing, or using the GetBackplate restaurant operations management platform (the &quot;Service&quot; or &quot;Platform&quot;), you acknowledge that you have read, understood, and agree to be bound by the terms of this Agreement. If you do not agree, you must not access or use the Service.</p>
      <p>If you are entering into this Agreement on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to this Agreement, in which case &quot;you&quot; refers to that entity.</p>
      <p>Please also review our <Link href="/legal/platform/privacy">Privacy Policy</Link>, which describes how we collect, use, and protect your information. The Privacy Policy is incorporated into this Agreement by reference.</p>

      <h2><span className="section-num">2.</span>Description of the Service</h2>
      <p>GetBackplate is a cloud-based restaurant operations management platform that provides tools for:</p>
      <ol>
        <li><strong>Employee management:</strong> onboarding, document storage, digital contract signing, certification and license tracking (including Food Handler and TABC certifications), performance records, disciplinary logs, and vacation and time-off management.</li>
        <li><strong>Operations management:</strong> shift communication logs, checklists by department and shift, task assignment, incident and accident logs, and equipment maintenance tracking.</li>
        <li><strong>Document management:</strong> secure storage, organization, and retrieval of operational and employee documents, with configurable expiration alerts.</li>
        <li><strong>Communication:</strong> platform notifications, email communications via Brevo, and WhatsApp messaging via ManyChat, subject to user consent.</li>
        <li><strong>Business intelligence:</strong> AI-powered reporting and operational insights across locations.</li>
        <li><strong>Supplier management:</strong> vendor and supplier directory for internal reference and procurement coordination.</li>
        <li><strong>Billing and subscription management:</strong> plan management, payment processing via Stripe, and access control based on subscription tier.</li>
      </ol>
      <p>The Platform is intended for use by restaurant owners, operators, managers, and their employees aged 18 or older.</p>

      <h2><span className="section-num">3.</span>Eligibility</h2>
      <p>The Service is intended exclusively for users who are 18 years of age or older. By accessing or using the Service, you represent and warrant that you are at least 18 years of age. GetBackplate does not knowingly permit individuals under the age of 18 to create accounts or access the Service. If we learn that a user is under 18, we will terminate that account immediately.</p>

      <h2><span className="section-num">4.</span>License Grant</h2>
      <p>Subject to your compliance with this Agreement, GetBackplate grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Service solely for your internal business operations during the term of your active subscription.</p>
      <p>All rights not expressly granted to you in this Agreement are reserved by GetBackplate.</p>

      <h2><span className="section-num">5.</span>Account Responsibilities</h2>

      <h3><span className="sub-num">5.1</span>Administrator Accounts</h3>
      <p>If you register as an account administrator (owner or manager), you are responsible for:</p>
      <ol>
        <li>Maintaining the confidentiality and security of your account credentials;</li>
        <li>All activity that occurs under your account, including actions taken by employees you grant access to;</li>
        <li>Ensuring that all users added to your account have been informed of and consent to the terms of this Agreement and the Privacy Policy;</li>
        <li>Verifying the accuracy of all data entered into the Platform, including employee records and operational data; and</li>
        <li>Promptly notifying GetBackplate of any unauthorized access to your account.</li>
      </ol>

      <h3><span className="sub-num">5.2</span>Employee Portal Accounts</h3>
      <p>Employees who access the Platform through the employee portal are subject to the permissions granted by their employer&apos;s administrator. Employees are responsible for maintaining the confidentiality of their own credentials and for any actions taken under their account.</p>

      <h2><span className="section-num">6.</span>Restrictions on Use</h2>
      <p>You agree that you will not, and will not permit any third party to:</p>
      <ol>
        <li>Copy, modify, adapt, translate, reverse engineer, decompile, or disassemble the Service or any portion thereof;</li>
        <li>Create derivative works based on the Service;</li>
        <li>Rent, lease, lend, sell, sublicense, assign, distribute, or otherwise transfer rights to the Service;</li>
        <li>Remove or alter any proprietary notices, labels, or marks on the Service;</li>
        <li>Use the Service to transmit unlawful, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable material;</li>
        <li>Use the Service in any way that violates applicable local, state, national, or international law or regulation;</li>
        <li>Attempt to gain unauthorized access to the Service, other accounts, or systems connected to the Service;</li>
        <li>Use the Service to store or transmit any data for which you have not received express authorization from the data owner; or</li>
        <li>Use the Service to process sensitive personal data beyond the scope of normal restaurant employment and operations management.</li>
      </ol>

      <h2><span className="section-num">7.</span>Employee Data and Privacy</h2>

      <h3><span className="sub-num">7.1</span>Employer Responsibilities</h3>
      <p>As an account administrator, you act as the data controller for the personal data of your employees that is entered into the Platform. You are solely responsible for:</p>
      <ol>
        <li>Obtaining all necessary consents from your employees to collect, store, and process their personal data through the Platform, including identification documents, employment records, certifications, and related information;</li>
        <li>Complying with all applicable employment and privacy laws governing the collection and use of employee data in your jurisdiction;</li>
        <li>Ensuring that employee data entered into the Platform is accurate, current, and limited to what is necessary for legitimate employment management purposes; and</li>
        <li>Informing employees of their rights regarding their personal data and of how their data is handled through the Platform.</li>
      </ol>

      <h3><span className="sub-num">7.2</span>Certification and License Data</h3>
      <p>The Platform includes functionality to store and track employee certifications and licenses, including but not limited to Food Handler certifications and TABC (Texas Alcoholic Beverage Commission) certifications. This data is treated as employment records. You are responsible for ensuring that the collection and storage of such records complies with applicable state and federal employment laws.</p>

      <h3><span className="sub-num">7.3</span>Document Storage</h3>
      <p>The Platform allows administrators and employees to upload and store documents, including identification documents, signed contracts, and other employment records. You are responsible for ensuring that you have lawful authority to collect and store such documents and that their storage complies with applicable law.</p>

      <h2><span className="section-num">8.</span>Digital Signatures</h2>
      <p>The Platform offers digital contract signing functionality through DocuSeal. Digital signatures executed through the Platform are intended to be legally valid under the United States Electronic Signatures in Global and National Commerce Act (ESIGN Act) and the Uniform Electronic Transactions Act (UETA). You are responsible for ensuring that your use of digital signatures complies with applicable law in your jurisdiction and for any specific requirements applicable to your employment contracts.</p>

      <h2><span className="section-num">9.</span>Communications and Messaging</h2>

      <h3><span className="sub-num">9.1</span>Email Communications</h3>
      <p>The Platform sends transactional and operational notifications via email through Brevo. By using the Platform, you and your employees consent to receive service-related email communications. All email communications include an option to manage notification preferences.</p>

      <h3><span className="sub-num">9.2</span>WhatsApp Messaging</h3>
      <p>The Platform offers WhatsApp-based notifications via ManyChat. WhatsApp messaging is only activated upon express opt-in consent from the individual recipient. Users may opt out at any time by responding STOP or through their notification settings within the Platform.</p>

      <h3><span className="sub-num">9.3</span>Platform Notifications</h3>
      <p>The Platform sends in-app notifications related to operational events, document expirations, checklist completions, and other service-related activities. These notifications are integral to the Service and cannot be fully disabled without limiting Platform functionality.</p>

      <h2><span className="section-num">10.</span>Subscription, Fees, and Payment</h2>

      <h3><span className="sub-num">10.1</span>Subscription Plans</h3>
      <p>Access to the Service is provided on a subscription basis. Available plans, features, and pricing are described on the GetBackplate pricing page and may be updated from time to time.</p>

      <h3><span className="sub-num">10.2</span>Payment</h3>
      <p>Subscription fees are processed through Stripe. By subscribing, you authorize GetBackplate to charge the applicable fees to your payment method on a recurring basis according to your selected billing cycle.</p>

      <h3><span className="sub-num">10.3</span>Plan Limits</h3>
      <p>Each subscription plan includes specific limits on the number of users, locations, and storage. Use of the Service beyond the limits of your plan may require an upgrade.</p>

      <h3><span className="sub-num">10.4</span>Cancellation and Refunds</h3>
      <p>You may cancel your subscription at any time. Cancellation will take effect at the end of your current billing period. GetBackplate does not provide refunds for unused portions of a subscription period except as required by applicable law.</p>

      <h3><span className="sub-num">10.5</span>Suspension for Non-Payment</h3>
      <p>GetBackplate reserves the right to suspend access to the Service for non-payment of subscription fees.</p>

      <h2><span className="section-num">11.</span>Intellectual Property</h2>
      <p>The Service, including all software, code, designs, documentation, AI models, and related materials, is the exclusive property of GetBackplate and is protected by United States and international intellectual property laws. This Agreement does not transfer any ownership rights to you.</p>
      <p>You retain ownership of all data you enter into the Platform (&quot;Customer Data&quot;). You grant GetBackplate a limited license to access, store, and process Customer Data solely for the purpose of providing the Service and as described in the Privacy Policy.</p>

      <h2><span className="section-num">12.</span>AI Features</h2>
      <p>The Platform includes AI-powered features that analyze operational data to generate reports, insights, and recommendations. You acknowledge that:</p>
      <ol>
        <li>AI-generated outputs are provided for informational purposes only and do not constitute legal, financial, or employment advice;</li>
        <li>You are solely responsible for reviewing and verifying the accuracy of AI-generated outputs before acting on them; and</li>
        <li>GetBackplate does not use your Customer Data to train general-purpose AI models without your explicit consent.</li>
      </ol>

      <h2><span className="section-num">13.</span>Disclaimer of Warranties</h2>
      <p>The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranty of any kind, express or implied. To the fullest extent permitted by applicable law, GetBackplate disclaims all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
      <p>GetBackplate does not warrant that the Service will be uninterrupted, error-free, or free of security vulnerabilities. You acknowledge that the Platform stores sensitive employee and operational data and that you are solely responsible for maintaining appropriate internal controls over access to such data.</p>

      <h2><span className="section-num">14.</span>Limitation of Liability</h2>
      <p>To the fullest extent permitted by applicable law, in no event shall GetBackplate be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to loss of profits, revenue, data, goodwill, or business opportunity.</p>
      <p>GetBackplate&apos;s total cumulative liability arising out of or relating to this Agreement shall not exceed the total subscription fees paid by you to GetBackplate during the twelve (12) months preceding the event giving rise to the claim, or one hundred U.S. dollars (USD $100), whichever is greater.</p>

      <h2><span className="section-num">15.</span>Indemnification</h2>
      <p>You agree to defend, indemnify, and hold harmless GetBackplate, its officers, directors, employees, contractors, and affiliates from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable attorneys&apos; fees) arising out of or in connection with:</p>
      <ol>
        <li>Your access to or use of the Service;</li>
        <li>Your violation of any term of this Agreement;</li>
        <li>Your failure to obtain required consents from employees whose data is processed through the Platform;</li>
        <li>Your violation of any applicable employment, privacy, or data protection law; or</li>
        <li>Any unauthorized access to your account resulting from your failure to maintain account security.</li>
      </ol>

      <h2><span className="section-num">16.</span>Regulated Industries</h2>
      <p>If your restaurant operation is subject to sector-specific regulatory requirements beyond standard food service regulations, you are solely responsible for ensuring that your use of the Platform complies with all applicable regulations. Specifically:</p>
      <ul>
        <li><strong>TABC-regulated operations:</strong> If you operate establishments licensed under the Texas Alcoholic Beverage Commission or equivalent state authority, you remain solely responsible for maintaining compliant records as required by your license, independent of the Platform&apos;s document storage functionality.</li>
        <li><strong>Government or institutional food service:</strong> If you operate under a government contract or serve institutional clients with specific data handling or audit requirements, you are responsible for ensuring that the Platform&apos;s data practices meet your applicable obligations.</li>
        <li><strong>Healthcare-adjacent operations:</strong> If your operation serves healthcare facilities or handles data that may be subject to HIPAA requirements, you must contact GetBackplate prior to use. Use of the Platform in HIPAA-regulated contexts without an executed Business Associate Agreement (BAA) is prohibited.</li>
      </ul>
      <p>GetBackplate reserves the right to require additional agreements or to decline service to entities whose regulatory requirements cannot be met within the Platform&apos;s standard terms.</p>

      <h2><span className="section-num">17.</span>Term and Termination</h2>
      <p>This Agreement is effective as of the date you first access the Service and continues until terminated.</p>
      <p>You may terminate this Agreement at any time by canceling your subscription and discontinuing all use of the Service.</p>
      <p>GetBackplate may suspend or terminate this Agreement immediately, with or without notice, if you breach any provision of this Agreement, if required by law, or if GetBackplate ceases to offer the Service.</p>
      <p>Upon termination, your right to access the Service immediately ceases. You may request a copy of your Customer Data within 30 days of termination, after which GetBackplate may delete your data in accordance with its data retention policies. Sections 6, 11, 13, 14, 15, 19, and 20 survive termination.</p>

      <h2><span className="section-num">18.</span>Modifications to the Service or Agreement</h2>
      <p>GetBackplate reserves the right to modify, update, or discontinue the Service, in whole or in part, at any time. GetBackplate may amend this Agreement from time to time. The most current version will be posted on the Platform, with a revised &quot;Last Updated&quot; date. Continued use of the Service after changes constitutes acceptance of the revised Agreement.</p>

      <h2><span className="section-num">19.</span>Governing Law and Dispute Resolution</h2>
      <p>This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, United States, without regard to its conflict-of-laws principles.</p>
      <p>Any dispute arising out of or relating to this Agreement shall be brought exclusively in the state or federal courts located in Harris County, Texas, and you consent to the personal jurisdiction of such courts.</p>

      <h2><span className="section-num">20.</span>General Provisions</h2>
      <p><strong>Entire Agreement.</strong> This Agreement, together with the Privacy Policy and any separate written agreements between you and GetBackplate, constitutes the entire agreement between the parties regarding the Service.</p>
      <p><strong>Severability.</strong> If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
      <p><strong>Waiver.</strong> No waiver of any term shall be deemed a further or continuing waiver of such term or any other term.</p>
      <p><strong>Assignment.</strong> You may not assign or transfer this Agreement without GetBackplate&apos;s prior written consent. GetBackplate may assign this Agreement freely.</p>
      <p><strong>Force Majeure.</strong> GetBackplate shall not be liable for any failure to perform due to causes beyond its reasonable control, including but not limited to internet outages, third-party service failures, or acts of God.</p>

      <h2><span className="section-num">21.</span>Contact Information</h2>
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
