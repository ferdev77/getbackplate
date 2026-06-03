import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { PageContent } from "@/shared/ui/page-content";
import { CheckCircle2, Clock, XCircle, Ban, Zap, FileStack, Tag } from "lucide-react";
import { PaymentLinkModal } from "./payment-link-modal";
import { CopyUrlButton } from "./copy-url-button";
import { CancelOrderButton } from "./cancel-order-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string>>;
};

const STATUS_CONFIG = {
  pending:  { label: "Pendiente",  cls: "text-amber-600  bg-amber-50  border-amber-200",   Icon: Clock },
  paid:     { label: "Pagado",     cls: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: CheckCircle2 },
  expired:  { label: "Expirado",  cls: "text-slate-500  bg-slate-50  border-slate-200",   Icon: XCircle },
  canceled: { label: "Cancelado", cls: "text-rose-500   bg-rose-50   border-rose-200",    Icon: Ban },
} as const;

const ACTION_CONFIG = {
  activate_module: { label: "Activar módulo",  Icon: Zap,       cls: "text-violet-600" },
  add_invoices:    { label: "Facturas",         Icon: FileStack, cls: "text-emerald-600" },
  custom:          { label: "Cobro custom",     Icon: Tag,       cls: "text-amber-600" },
} as const;

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default async function PaymentLinksPage(_props: PageProps) {
  const supabase = createSupabaseAdminClient();

  const [{ data: orders }, { data: orgs }, { data: modules }] = await Promise.all([
    supabase
      .from("manual_payment_orders")
      .select("id, organization_id, description, internal_notes, amount_cents, currency, action_type, action_payload, status, checkout_url, paid_at, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("organizations").select("id, name").eq("status", "active").order("name"),
    supabase.from("module_catalog").select("id, code, name").order("name"),
  ]);

  const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name]));
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
        <div className="overflow-x-auto rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                {["Organización", "Descripción", "Monto", "Acción", "Estado", "Creado", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => {
                const st = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                const ac = ACTION_CONFIG[order.action_type as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.custom;
                const payload = order.action_payload as Record<string, unknown> | null;
                const isLast  = i === orders.length - 1;

                return (
                  <tr key={order.id} className={`transition-colors hover:bg-[var(--gbp-bg)] ${!isLast ? "border-b border-[var(--gbp-border)]" : ""}`}>
                    <td className="pl-5 pr-4 py-4">
                      <p className="font-semibold text-foreground">
                        {orgMap.get(order.organization_id ?? "") ?? <span className="text-muted-foreground italic">eliminada</span>}
                      </p>
                    </td>
                    <td className="max-w-[200px] px-4 py-4">
                      <p className="truncate font-medium text-foreground">{order.description}</p>
                      {order.internal_notes && (
                        <p className="mt-0.5 truncate text-[11px] italic text-muted-foreground">{order.internal_notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 font-bold text-foreground whitespace-nowrap">
                      {fmt(order.amount_cents, order.currency)}
                    </td>
                    <td className="px-4 py-4">
                      <div className={`flex items-center gap-1.5 ${ac.cls}`}>
                        <ac.Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[11px] font-semibold">{ac.label}</span>
                      </div>
                      {payload && (payload.moduleCode != null || payload.invoiceCount != null) && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {payload.moduleCode != null ? String(payload.moduleCode) : `+${String(payload.invoiceCount)} facturas`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${st.cls}`}>
                        <st.Icon className="h-3 w-3" />
                        {st.label}
                      </span>
                      {order.paid_at && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(order.paid_at)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[11px] text-muted-foreground whitespace-nowrap">
                      {fmtDate(order.created_at)}
                    </td>
                    <td className="pr-5 pl-4 py-4">
                      <div className="flex items-center gap-2">
                        {order.checkout_url && order.status === "pending" && (
                          <CopyUrlButton url={order.checkout_url} />
                        )}
                        {order.status === "pending" && (
                          <CancelOrderButton orderId={order.id} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageContent>
  );
}
