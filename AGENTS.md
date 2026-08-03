# AGENTS.md — GetBackplate Platform Guide

Reference document for AI agents and developers working on this codebase.

---

## Architecture Overview

Next.js 16 app with Supabase (PostgreSQL + Auth + Realtime) and Stripe for billing.
Multi-tenant SaaS: each `organizations` row is a tenant identified by `tenant.organizationId`.

**Key conventions:**
- Server actions: `"use server"` files co-located with the page that uses them
- API routes: `web/src/app/api/`
- Shared UI: `web/src/shared/ui/`
- Module-scoped logic: `web/src/modules/<module>/`
- Superadmin UI: `web/src/app/(superadmin)/superadmin/`
- Company (tenant) UI: `web/src/app/(company)/app/`
- **No `middleware.ts`** — routing proxy lives in `web/src/proxy.ts` (Next.js 16+)

---

## Dual-Plan Model

Organizations can hold two plans simultaneously:

| Column | Table | Purpose |
|--------|-------|---------|
| `plan_id` | `organizations` | Platform plan (Starter / Custom) — HR, docs, checklists |
| `integration_plan_id` | `organizations` | Integration plan (Connect / Grow / Scale / Enterprise) — QBO-R365 |

`syncOrganizationPlan()` in `organization.service.ts` accepts an optional `integrationPlanId`
and takes the union of both plans modules when activating an org.

---

## Stripe Billing Flows

### Platform plans (`plan_type = 'platform'`)
`/app/billing/checkout-launch` → Stripe Checkout (subscription mode) → webhook → `checkout.session.completed` normal plan branch.

### Integration plans (`plan_type = 'qbo_r365'`)
`/api/stripe/checkout-integration` → Stripe Checkout (subscription mode, `metadata.isAddon = 'true'`) → webhook → addon branch.

### Manual payment orders (ad-hoc, no Price ID required)
`/api/stripe/checkout-manual` → Stripe Checkout (**payment mode**, `price_data`) → webhook → manual payment branch.

### Manual subscription orders (recurring plan, no login required)
`/api/stripe/checkout-manual-subscription` → Stripe Checkout (**subscription mode**) reusing the exact `metadata` shape of the platform/addon branches → webhook → same platform/addon branch as the logged-in flows (zero provisioning changes, only an extra tracking update).

---

## Manual Payment Orders

**Purpose:** Superadmin generates a one-time Stripe Checkout link for a specific organization.
On payment, a configured action executes automatically.

### Table: `manual_payment_orders`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations |
| `created_by` | UUID | FK → auth.users (superadmin who created it) |
| `description` | TEXT | Visible to customer in Stripe checkout |
| `internal_notes` | TEXT | Superadmin-only context |
| `amount_cents` | INTEGER | Price in cents (e.g. 4999 = $49.99) |
| `currency` | TEXT | usd, ars, etc. |
| `action_type` | TEXT | `activate_module` / `add_invoices` / `add_slot` / `custom` (legacy single-item) |
| `action_payload` | JSONB | See shapes below (legacy single-item) |
| `items` | JSONB | Array of line items for multi-item orders. Schema: `[{description, amount_cents, action_type, action_payload}]`. NULL for legacy single-item orders |
| `stripe_session_id` | TEXT | Stripe Checkout Session ID (unique) |
| `checkout_url` | TEXT | Shareable payment URL |
| `status` | TEXT | `pending` / `paid` / `expired` / `canceled` |
| `paid_at` | TIMESTAMPTZ | Set by webhook on successful payment |
| `stripe_payment_intent_id` | TEXT | Set by webhook on successful payment |
| `customer_email` | TEXT | Customer email captured on payment |
| `expires_at` | TIMESTAMPTZ | Informational — Stripe sessions also have their own expiry |

### items array (multi-item orders — preferred)

```jsonc
[
  { "description": "Módulo Mantenimiento", "amountCents": 4999, "actionType": "activate_module", "actionPayload": { "moduleCode": "maintenance" } },
  { "description": "500 facturas adicionales", "amountCents": 2999, "actionType": "add_invoices", "actionPayload": { "invoiceCount": 500 } },
  { "description": "Taxes (8.25%)", "amountCents": 660, "actionType": "custom", "actionPayload": null }
]
```

### action_payload shapes (legacy single-item)

```jsonc
// activate_module — enables a module in organization_modules
{ "moduleCode": "maintenance" }

// add_invoices — credits organization_addons.invoice_balance
{ "invoiceCount": 500 }

// add_slot — increments organization_addons.extra_r365_connections
{ "slotCount": 1 }

// custom — payment is recorded, no automatic side-effect
{}
```

### Webhook handler

File: `web/src/app/api/stripe/webhook/route.ts`
Event: `checkout.session.completed`

The manual payment branch runs **first** (checked via `session.metadata?.manualPaymentOrderId`),
before the addon branch (`metadata.isAddon`) and the normal plan branch.

### Actions executed on payment

| action_type | Effect |
|---|---|
| `activate_module` | Upserts `organization_modules` with `is_enabled = true` for the given `moduleCode` |
| `add_invoices` | Calls `increment_invoice_balance(org_id, count)` RPC → atomically increments `organization_addons.invoice_balance` |
| `add_slot` | Calls `increment_r365_slots(org_id, count)` RPC → atomically increments `organization_addons.extra_r365_connections` |
| `custom` | Marks order as `paid`, no DB side-effect |

### Superadmin UI

`/superadmin/payment-links` — table of all orders with status, amount, action, copy-link and cancel buttons.
Modal (client component): org selector + amount + currency + action type + action payload + expiry + internal notes.

### Security

- API route uses `assertSuperadminApi()` — returns 401/403 if caller is not superadmin.
- DB table has RLS policy `mpo_superadmin_all` — only `is_superadmin()` users can read/write.
- Webhook verifies Stripe signature via `stripe.webhooks.constructEvent` before any processing.

---

## Manual Subscription Orders

**Purpose:** Superadmin starts a recurring plan (platform or QBO-R365 integration) for an
organization whose admin will never log in (e.g. clients the team manages directly via
QuickBooks only). Sends a real Stripe Checkout link (subscription mode) instead of requiring
the org admin to subscribe from `/app/billing` or `/app/integrations/quickbooks`.

**Upgrade rule — the key difference from manual payment orders:** if the organization already
has an active subscription of the requested `plan_kind`, **no link is generated**. The endpoint
applies the plan change immediately via `stripe.subscriptions.update()` with proration on the
card already on file — exactly what the logged-in flows (`/api/stripe/checkout`,
`/api/stripe/checkout-integration`) already do for their own upgrade path. The order row is still
inserted, with `status = 'upgraded'`, purely for traceability — there is never a `checkout_url`
for that case.

### Table: `manual_subscription_orders`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK → organizations |
| `created_by` | UUID | FK → auth.users (superadmin who created it) |
| `plan_kind` | TEXT | `platform` / `integration` |
| `plan_id` | UUID | FK → plans (filtered by `plan_type = 'platform'` or `'qbo_r365'`) |
| `billing_period` | TEXT | `monthly` / `yearly` |
| `include_setup_fee` | BOOLEAN | Only meaningful for `plan_kind = 'integration'` |
| `status` | TEXT | `pending` / `completed` / `expired` / `canceled` / `upgraded` |
| `stripe_session_id` | TEXT | NULL for `upgraded` orders (no Checkout Session was ever created) |
| `checkout_url` | TEXT | NULL for `upgraded` orders |
| `completed_at` | TIMESTAMPTZ | Set by webhook (`completed`) or by the endpoint itself (`upgraded`) |
| `expires_at` | TIMESTAMPTZ | +24h from creation, only relevant for `pending` |

### Endpoint: `POST /api/stripe/checkout-manual-subscription`

File: `web/src/app/api/stripe/checkout-manual-subscription/route.ts`

1. `assertSuperadminApi()`.
2. Resolves the plan (filtered by `plan_type`) and the target Stripe price for the requested period.
3. Detects an existing active subscription of that `plan_kind` (`subscriptions` table for platform,
   `organization_addons` for integration).
4. Same plan → returns a Billing Portal URL. Different plan → instant proration update,
   inserts `status='upgraded'`. No active subscription → creates the Checkout Session and inserts
   `status='pending'`.
5. The Checkout Session's `metadata`/`subscription_data.metadata` is built to look **identical** to
   what `/api/stripe/checkout` and `/api/stripe/checkout-integration` already send — the only
   addition is `manualSubscriptionOrderId`, used solely by the webhook to flip the tracking row to
   `completed`. `success_url`/`cancel_url` point to the public `/pay/success` / `/pay/canceled`
   pages (not `/app/...`), since the customer is never logged in.
6. Reuses the existing `stripe_customers` mapping when present, with the same "stale customer"
   retry safeguard as `checkout-manual.ts` (deletes the mapping and retries without `customer` if
   Stripe returns "No such customer").

### Webhook handler

File: `web/src/app/api/stripe/webhook/route.ts`, event `checkout.session.completed`.
No provisioning logic was added or changed — the addon branch and the normal plan branch run
exactly as they do for the logged-in flows. The only addition is
`markManualSubscriptionOrderCompleted()`, called at the end of each of those two branches when
`session.metadata?.manualSubscriptionOrderId` is present, to flip the row to `completed`.

### Superadmin UI

`/superadmin/payment-links` — second section "Links de Suscripción" below the ad-hoc payments
table. Modal: org selector + plan kind (platform/integration) + plan + billing period + optional
setup fee checkbox. If the response is `{ upgraded: true }`, shows a success message with no link
to copy; if `{ url }`, same copy-link UX as ad-hoc payment links.

### Security

Same as Manual Payment Orders: `assertSuperadminApi()` on the route, RLS policy
`mso_superadmin_all` (`is_superadmin()` only), Stripe signature verification in the webhook.

---

## Module Activation (programmatic)

```ts
await supabase.from('organization_modules').upsert(
  {
    organization_id: orgId,
    module_id: moduleId,
    is_enabled: true,
    enabled_at: new Date().toISOString(),
  },
  { onConflict: 'organization_id,module_id' },
);
```

Module codes live in `module_catalog.code` (e.g. `maintenance`, `qbo_r365`, `documents`).

---

## Invoice Balance

`organization_addons.invoice_balance` (INTEGER, default 0) — extra invoices credited via manual
payments, added on top of the plan base quota.

Atomic increment via Supabase RPC: `increment_invoice_balance(p_organization_id, p_amount)`.

---

## Notification Channels — three, and only three

**`in_app`, `push`, `email`. Nothing else. SMS and WhatsApp are gone.**

| Channel | When it fires | Configurable? |
|---------|---------------|---------------|
| `in_app` (campanita) | **always** | no |
| `push` (device) | **always** | no |
| `email` | only if enabled | yes |

The three are **independent**: a failed push does not stop the `in_app` row, and a
bounced email does not affect the other two. `in_app` is the guaranteed record of
"this was meant to reach you" — `sendPushToUsers` writes it for every recipient
even when nobody has a push subscription (`infrastructure/push/send-to-org.ts`),
and `sendTransactionalEmail` writes it too (`infrastructure/email/client.ts`).
Use `userIdParaEmailSinDuplicarCampanita` when a message goes out by push *and*
email so the bell is not written twice.

### One notification, two destinations

`/app/...` (company panel) and `/portal/...` (employee portal) are different
apps. **A notification to a mixed audience must be split** — there is no single
URL that works for both. Use `sendPushPorRol` (`shared/lib/notification-links.ts`):
it separates `company_admin` recipients from everyone else and sends two pushes,
each with its own link. Since `sendPushToUsers` writes the `in_app` row, splitting
the push also splits the bell, so each person keeps the correct link in history.

| Module | admin | employee |
|--------|-------|----------|
| checklists | `/app/reports` | `/portal/checklist` |
| documents | `/app/documents` | `/portal/documents` |
| announcements | `/app/announcements` | `/portal/announcements` |
| vendors | `/app/vendors` | `/portal/vendors` |

`modules/vendors/notifications.ts` resolves both audiences itself and stays as
is — it is the original of this pattern.

### `in_app` is never queued as a delivery channel

For announcements, only `push` and `email` become `announcement_deliveries`
rows. `push` is mandatory (create **and** edit) and already writes the bell for
the whole audience, so queueing `in_app` separately would duplicate it. Legacy
`in_app` rows are handled in `deliveries.ts`: closed as `sent` when a twin
`push` row exists, otherwise sent as push so the bell still gets written.

### SMS is discontinued — do not "fix" it back

SMS was removed from the product. The UI selector is gone and the send path is
cut. **Stale `'sms'` values still exist in the database on purpose** — no data
migration was run — so you will keep seeing the string around. That is expected,
not an oversight. The cut points that make it inert:

| Where | What it does |
|-------|--------------|
| `modules/checklists/lib/notification-channels.ts` | drops `'sms'` and maps legacy `'all'` → `email` only |
| `modules/announcements/services/announcement-recurrence.service.ts` | `DELIVERY_CHANNELS` excludes `sms`, so recurring jobs with stale metadata stop queueing |
| `modules/announcements/services/deliveries.ts` | pre-existing `queued` SMS rows are closed as `expired`, never sent |
| `modules/announcements/actions.ts` + `api/employee/announcements/manage` | `'sms'` filtered out of any incoming POST |

`infrastructure/twilio/client.ts` and `sendChecklistAudienceTwilio` are kept but
have **no callers**. Twilio still appears in the privacy policy as a
subprocessor, and `TWILIO_*` env vars still exist. Re-enabling any of this is a
product decision, not a bug fix.

The landing page still markets "SMS & WhatsApp Notifications"
(`modules/landing/ui/landing-experience.tsx`) — known and deliberately left
alone; changing public commercial copy is the owner's call.

---

## Cache Keys

When adding new cached queries in `cached-queries.ts`, bump the version suffix
(e.g. `integration-plans-qbo_r365-v2` → `v3`) to bust the Next.js unstable_cache after schema changes.

---

## Migration Conventions

- Filename: `supabase/migrations/YYYYMMDD######_description.sql`
- Always use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / DO blocks for idempotency
- Constraints: wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- RLS policies: always `DROP POLICY IF EXISTS` before `CREATE POLICY`
- Triggers: always `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`
- After adding columns to cached queries, bump the cache key version string
- If a migration is applied manually or by an AI outside the normal Supabase migration runner, the agent must also reconcile `supabase_migrations.schema_migrations` in that environment before finishing. Do not leave schema changes applied without the matching migration-history row.
- Before considering migration work complete, verify that the versions present in `supabase/migrations/` match the rows recorded in `supabase_migrations.schema_migrations` for the target environment, and explicitly fix any drift.

---

## Environment Safety Baseline (2026-07-26)

- Development Supabase project: `uubdslmtfxwraszinpao`.
- Production Supabase project: `mfhyemwypuzsqjqxtbjf`.
- Prodel exists only in production. Its QBO tokens, FTP settings, sync configs, documents, and billing data must never be used by tests.
- Unit tests load no `.env` files (`envDir: false`) and `test/network-guard.ts` blocks fetch, HTTP/S, TCP, TLS, HTTP/2, and UDP.
- Hosted integration tests may use Supabase dev only. `verify-dev-rls-isolation.mjs`, `verify-dev-migrations.mjs`, and `apply-dev-migration.mjs` refuse any unexpected project ref.
- The dev RLS runner creates all Auth and tenant fixtures in one PostgreSQL transaction and always rolls it back. It also verifies that no QA fixture remains.
- Do not run the legacy `verify-tenant-isolation.mjs` as the canonical RLS test: it may reuse the first organization and persist Auth users.
- Dev currently has a QBO sandbox organization, but `QBO_ENVIRONMENT` is not configured and the code defaults to the production Intuit API. Database tests must remain network-isolated; do not run QBO synchronization as part of RLS verification.

### Current test commands

Run from `web/`:

```bash
npm test                         # 415 tests / 52 files as of 2026-07-26
npm run test:critical            # Critical coverage gate, including QBO environment resolution
npm run verify:rls-isolation:dev # Real PostgreSQL RLS/RPC checks, rollback-only
npm run verify:migrations:dev    # Local migration files vs dev history
npx tsc --noEmit --incremental false
npm run lint
```

### Security invariants

- Employees can read only their own HR row, contract, and salary unless they are an authorized organization administrator.
- Direct user scope is an explicit access grant. Values inside one dimension are OR; populated location, department, and position dimensions are AND.
- Privileged billing, cleanup, provisioning, and atomic write RPCs are service-role only unless the function performs an explicit actor/tenant authorization check.
- Never trust caller-supplied `user_id`, `role_code`, or `organization_id` inside a `SECURITY DEFINER` function without binding it to `auth.uid()` and membership.

### Security migration deployment (2026-07-26)

Migrations `20260726000003` through `20260726000011` are applied and tracked in both dev and production. Post-deploy verification confirmed 194/194 versions, unchanged protected row counts, all public tables with RLS, and privileged RPC execution restricted to `service_role`.
