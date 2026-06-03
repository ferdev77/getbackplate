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
| `action_type` | TEXT | `activate_module` / `add_invoices` / `custom` |
| `action_payload` | JSONB | See shapes below |
| `stripe_session_id` | TEXT | Stripe Checkout Session ID (unique) |
| `checkout_url` | TEXT | Shareable payment URL |
| `status` | TEXT | `pending` / `paid` / `expired` / `canceled` |
| `paid_at` | TIMESTAMPTZ | Set by webhook on successful payment |
| `expires_at` | TIMESTAMPTZ | Informational — Stripe sessions also have their own expiry |

### action_payload shapes

```jsonc
// activate_module — enables a module in organization_modules
{ "moduleCode": "maintenance" }

// add_invoices — credits organization_addons.invoice_balance
{ "invoiceCount": 500 }

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
| `custom` | Marks order as `paid`, no DB side-effect |

### Superadmin UI

`/superadmin/payment-links` — table of all orders with status, amount, action, copy-link and cancel buttons.
Modal (client component): org selector + amount + currency + action type + action payload + expiry + internal notes.

### Security

- API route uses `assertSuperadminApi()` — returns 401/403 if caller is not superadmin.
- DB table has RLS policy `mpo_superadmin_all` — only `is_superadmin()` users can read/write.
- Webhook verifies Stripe signature via `stripe.webhooks.constructEvent` before any processing.

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
