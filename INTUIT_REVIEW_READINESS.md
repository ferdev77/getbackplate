# Intuit App Review Readiness

Last updated: 2026-07-19

## Review URLs

- Application: `https://app.getbackplate.com`
- Integration landing and pricing: `https://app.getbackplate.com/integrations/qbo-r365`
- Privacy policy: `https://app.getbackplate.com/legal/integration/privacy`
- End-user license agreement: `https://app.getbackplate.com/legal/integration/terms`
- Master Services Agreement: `https://app.getbackplate.com/legal/integration/msa`
- Trust Center: `https://app.getbackplate.com/trust`
- Support and data requests: `https://app.getbackplate.com/support`

## Intuit Listing Template

**Application name:** GetBackplate

**Short description:** GetBackplate transforms invoices and credit memos from QuickBooks Online into Restaurant365-compatible CSV files and delivers them to customer-configured Restaurant365 FTP or FTPS endpoints.

**Detailed description:** Customers authorize GetBackplate through Intuit OAuth 2.0. The service reads invoice, credit memo, customer, item, tax, and related accounting data needed to create a Restaurant365 Multi-Invoice CSV. CSV content is generated in application memory and transmitted directly to the configured destination. GetBackplate does not retain a stored copy of generated CSV content. Delivery metadata and operational records are retained for up to 12 months; minimum fiscal and billing records are retained for up to seven years.

**QuickBooks data use:** Data is used only to provide invoice transformation, delivery, monitoring, troubleshooting, security, billing, and legally required recordkeeping. It is not sold, used for advertising, or used to train AI models.

**Data deletion process:** Customers submit access, export, correction, or deletion requests at `/support`. Requests receive a tracking reference and are verified before fulfillment. Operational data is deleted subject to the published schedule; minimum fiscal and billing records may be retained where legally required.

**Support contact:** `support@getbackplate.com`

**Privacy contact:** `privacy@getbackplate.com`

## Reviewer Test Account Checklist

- [ ] Create a dedicated reviewer organization and company-admin account.
- [ ] Require the normal company-admin MFA flow; do not provide shared production credentials.
- [ ] Seed no real customer or production invoice data.
- [ ] Confirm Intuit OAuth redirect and disconnect URLs match the production configuration.
- [ ] Provide one test QBO company with representative invoice and credit-memo records.
- [ ] Provide a non-production FTP/FTPS destination controlled for review.
- [ ] Include exact steps to connect QBO, map a customer, run a sync, inspect status, and disconnect.
- [ ] Verify the support form returns a reference and both acknowledgement emails arrive.

## Operational Evidence Checklist

- [ ] Daily cron `/api/internal/cron/daily` is enabled and reports `purgeExpiredIntuitData` success.
- [ ] Operational cutoff is 12 calendar months; fiscal cutoff is seven calendar years.
- [ ] `qbo_unified_invoices.raw_entity` is cleared after 12 months while summary columns remain for seven years.
- [ ] `billing_records` receives idempotent rows for paid Stripe invoices and manual payments.
- [ ] `legal_acceptance_records` receives Stripe Checkout acceptance evidence.
- [ ] Public pricing shows full monthly setup and the configured annual setup discount, never a waiver.
- [ ] Legal and Trust pages describe FTP/FTPS as endpoint-configured and do not claim SFTP support.
- [ ] Legal pages state that generated CSV content is not retained.
- [ ] Migration `20260719000001` is applied through the normal migration runner and recorded in `supabase_migrations.schema_migrations` before production release.

## Evidence To Capture For Submission

- Screenshot or export of Intuit OAuth scopes and redirect URIs.
- Short screen recording of connect, invoice delivery, status visibility, and disconnect.
- Sample redacted CSV and corresponding delivery metadata record.
- Redacted retention cron result showing affected-record counts.
- Redacted support/privacy request acknowledgement with reference ID.
- Links and version dates for all legal documents supplied to Intuit.
