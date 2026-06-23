import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { PageContent } from "@/shared/ui/page-content";
import { PaymentLinkModal } from "./payment-link-modal";
import { PaymentLinksTable } from "./payment-links-table";
import { SubscriptionLinkModal } from "./subscription-link-modal";
import { SubscriptionLinksTable } from "./subscription-links-table";
import { InvoicePriceList } from "./invoice-price-list";

export const dynamic = "force-dynamic";

export default async function PaymentLinksPage() {
  const supabase = createSupabaseAdminClient();

  await Promise.all([
    supabase
      .from("manual_payment_orders")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString()),
    supabase
      .from("manual_subscription_orders")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString()),
  ]);

  const [{ data: orders }, { data: orgs }, { data: modules }, { data: subscriptionOrders }, { data: plans }] = await Promise.all([
    supabase
      .from("manual_payment_orders")
      .select("id, organization_id, description, internal_notes, amount_cents, currency, action_type, action_payload, items, status, checkout_url, paid_at, expires_at, created_at, stripe_payment_intent_id, customer_email")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("organizations").select("id, name").eq("status", "active").order("name"),
    supabase.from("module_catalog").select("id, code, name").order("name"),
    supabase
      .from("manual_subscription_orders")
      .select("id, organization_id, plan_kind, plan_id, billing_period, include_setup_fee, status, checkout_url, completed_at, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("plans").select("id, name, plan_type, setup_fee_amount").eq("is_active", true).eq("is_enterprise", false).order("name"),
  ]);

  const qboModuleId = (modules ?? []).find(m => m.code === "qbo_r365")?.id ?? null;
  const { data: integrationAddons } = qboModuleId
    ? await supabase
        .from("organization_addons")
        .select("organization_id, price_per_invoice_cents")
        .eq("module_id", qboModuleId)
        .eq("status", "active")
    : { data: [] as { organization_id: string; price_per_invoice_cents: number | null }[] };

  const orgMap = Object.fromEntries((orgs ?? []).map(o => [o.id, o.name]));
  const planMap = Object.fromEntries((plans ?? []).map(p => [p.id, p.name]));
  const invoicePriceOrgs = (integrationAddons ?? [])
    .map(a => ({
      organizationId: a.organization_id,
      organizationName: orgMap[a.organization_id] ?? "(organización eliminada)",
      priceCents: a.price_per_invoice_cents,
    }))
    .filter(o => orgMap[o.organizationId])
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  const platformPlans = (plans ?? []).filter(p => p.plan_type === "platform").map(p => ({ id: p.id, name: p.name, setupFeeAmount: p.setup_fee_amount }));
  const integrationPlans = (plans ?? []).filter(p => p.plan_type === "qbo_r365").map(p => ({ id: p.id, name: p.name, setupFeeAmount: p.setup_fee_amount }));
  const totalPaid    = (orders ?? []).filter(o => o.status === "paid").length;
  const totalPending = (orders ?? []).filter(o => o.status === "pending").length;

  return (
    <PageContent>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Links de Pago</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checkouts Stripe ad-hoc para cobrar módulos, facturas o servicios a organizaciones específicas.
          </p>
        </div>
        <PaymentLinkModal
          organizations={(orgs ?? []).map(o => ({ id: o.id, name: o.name }))}
          modules={(modules ?? []).map(m => ({ id: m.id, code: m.code, name: m.name }))}
        />
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total generados", value: (orders ?? []).length, cls: "text-foreground" },
          { label: "Pagados",         value: totalPaid,             cls: "text-emerald-600" },
          { label: "Pendientes",      value: totalPending,          cls: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-3xl font-extrabold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {!orders || orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] px-8 py-16 text-center">
          <p className="text-sm font-semibold text-muted-foreground">Todavía no hay links generados.</p>
          <p className="mt-1 text-xs text-muted-foreground">Creá el primero con el botón de arriba.</p>
        </div>
      ) : (
        <PaymentLinksTable orders={orders} orgMap={orgMap} />
      )}

      {/* Links de Suscripción */}
      <div className="mb-8 mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gbp-border)] pt-10">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Links de Suscripción</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Alta de plan recurrente (plataforma o integración QBO-R365) sin que el cliente tenga que loguearse.
          </p>
        </div>
        <SubscriptionLinkModal
          organizations={(orgs ?? []).map(o => ({ id: o.id, name: o.name }))}
          platformPlans={platformPlans}
          integrationPlans={integrationPlans}
        />
      </div>

      {!subscriptionOrders || subscriptionOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] px-8 py-16 text-center">
          <p className="text-sm font-semibold text-muted-foreground">Todavía no hay links de suscripción generados.</p>
          <p className="mt-1 text-xs text-muted-foreground">Creá el primero con el botón de arriba.</p>
        </div>
      ) : (
        <SubscriptionLinksTable orders={subscriptionOrders} orgMap={orgMap} planMap={planMap} />
      )}

      {/* Precio por factura enviada */}
      <div className="mb-6 mt-14 border-t border-[var(--gbp-border)] pt-10">
        <h2 className="text-2xl font-bold text-foreground">Precio por factura enviada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobro de uso opcional por organización con integración QBO-R365 activa. Dejalo vacío para no cobrar.
        </p>
      </div>
      <InvoicePriceList organizations={invoicePriceOrgs} />
    </PageContent>
  );
}
