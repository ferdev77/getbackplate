"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Clock, XCircle, Ban, Zap, FileStack, Tag, Plug, ChevronDown, ExternalLink, Mail, CreditCard, Calendar, Timer, Layers } from "lucide-react";
import { CopyUrlButton } from "./copy-url-button";
import { CancelOrderButton } from "./cancel-order-button";
import { DeleteOrderButton } from "./delete-order-button";

const STATUS_CONFIG = {
  pending:  { label: "Pendiente",  cls: "text-amber-600  bg-amber-50  border-amber-200",   Icon: Clock },
  paid:     { label: "Pagado",     cls: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: CheckCircle2 },
  expired:  { label: "Expirado",  cls: "text-slate-500  bg-slate-50  border-slate-200",   Icon: XCircle },
  canceled: { label: "Cancelado", cls: "text-rose-500   bg-rose-50   border-rose-200",    Icon: Ban },
} as const;

const ACTION_CONFIG = {
  activate_module: { label: "Activar módulo",  Icon: Zap,       cls: "text-violet-600" },
  add_invoices:    { label: "Facturas",         Icon: FileStack, cls: "text-emerald-600" },
  add_slot:        { label: "Slot + Setup Fee", Icon: Plug,      cls: "text-sky-600" },
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

type StoredItem = {
  description: string;
  amount_cents: number;
  action_type: string;
  action_payload: Record<string, unknown> | null;
};

type Order = {
  id: string;
  organization_id: string | null;
  description: string;
  internal_notes: string | null;
  amount_cents: number;
  currency: string;
  action_type: string;
  action_payload: unknown;
  items: StoredItem[] | null;
  status: string;
  checkout_url: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  customer_email: string | null;
};

type Props = {
  orders: Order[];
  orgMap: Record<string, string>;
};

const isTestMode = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test");

function ActionCell({ order }: { order: Order }) {
  const storedItems = order.items;
  const isMulti = storedItems && storedItems.length > 1;

  if (isMulti) {
    return (
      <div className="flex items-center gap-1.5 text-[var(--gbp-text2)]">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] font-semibold">{storedItems.length} acciones</span>
      </div>
    );
  }

  // Single item (new or legacy)
  const actionType = storedItems?.[0]?.action_type ?? order.action_type;
  const actionPayload = (storedItems?.[0]?.action_payload ?? order.action_payload) as Record<string, unknown> | null;
  const ac = ACTION_CONFIG[actionType as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.custom;

  return (
    <div>
      <div className={`flex items-center gap-1.5 ${ac.cls}`}>
        <ac.Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] font-semibold">{ac.label}</span>
      </div>
      {actionPayload && (actionPayload.moduleCode != null || actionPayload.invoiceCount != null) && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {actionPayload.moduleCode != null
            ? String(actionPayload.moduleCode)
            : `+${String(actionPayload.invoiceCount)} facturas`}
        </p>
      )}
    </div>
  );
}

function ItemsBreakdown({ items, currency }: { items: StoredItem[]; currency: string }) {
  return (
    <div className="mt-4 pt-4 border-t border-[var(--gbp-border)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Items ({items.length})
      </p>
      <div className="space-y-2">
        {items.map((item, idx) => {
          const ac = ACTION_CONFIG[item.action_type as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.custom;
          const payload = item.action_payload;
          return (
            <div key={idx} className="flex items-start justify-between gap-4 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">{item.description}</p>
                <div className={`mt-0.5 flex items-center gap-1 ${ac.cls}`}>
                  <ac.Icon className="h-3 w-3 shrink-0" />
                  <span className="text-[10px] font-medium">{ac.label}</span>
                  {payload?.moduleCode != null && (
                    <span className="text-[10px] text-muted-foreground">· {String(payload.moduleCode)}</span>
                  )}
                  {payload?.invoiceCount != null && (
                    <span className="text-[10px] text-muted-foreground">· +{String(payload.invoiceCount)} facturas</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-foreground whitespace-nowrap">
                {fmt(item.amount_cents, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const getSecondsLeft = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [secs, setSecs] = useState(getSecondsLeft);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(getSecondsLeft()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (secs <= 0) return <span className="text-[11px] font-semibold text-rose-500">Expirado</span>;

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const colorCls = secs < 3600 ? "text-rose-600" : secs < 7200 ? "text-amber-600" : "text-foreground";

  return (
    <span className={`font-mono text-[11px] font-semibold tabular-nums ${colorCls}`}>
      {h > 0 ? `${h}h ` : ""}{String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

export function PaymentLinksTable({ orders, orgMap }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
            {["", "Organización", "Descripción", "Monto", "Acción", "Estado", "Creado", ""].map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground first:pl-3 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, i) => {
            const st = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            const isLast = i === orders.length - 1;
            const isExpanded = expandedId === order.id;
            const isPaid = order.status === "paid";
            const storedItems = order.items as StoredItem[] | null;
            const isMulti = storedItems && storedItems.length > 1;

            return (
              <>
                <tr
                  key={order.id}
                  onClick={() => toggle(order.id)}
                  className={`cursor-pointer transition-colors hover:bg-[var(--gbp-bg)] ${!isLast || isExpanded ? "border-b border-[var(--gbp-border)]" : ""} ${isExpanded ? "bg-[var(--gbp-bg)]" : ""}`}
                >
                  {/* Expand chevron */}
                  <td className="pl-3 pr-2 py-4 w-8">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </td>

                  <td className="px-4 py-4">
                    <p className="font-semibold text-foreground">
                      {orgMap[order.organization_id ?? ""] ?? <span className="italic text-muted-foreground">eliminada</span>}
                    </p>
                  </td>

                  <td className="max-w-[180px] px-4 py-4">
                    <p className="truncate font-medium text-foreground">
                      {isMulti ? (
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {order.description}
                        </span>
                      ) : order.description}
                    </p>
                    {order.internal_notes && (
                      <p className="mt-0.5 truncate text-[11px] italic text-muted-foreground">{order.internal_notes}</p>
                    )}
                  </td>

                  <td className="px-4 py-4 font-bold text-foreground whitespace-nowrap">
                    {fmt(order.amount_cents, order.currency)}
                  </td>

                  <td className="px-4 py-4">
                    <ActionCell order={order} />
                  </td>

                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${st.cls}`}>
                      <st.Icon className="h-3 w-3" />
                      {st.label}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-[11px] text-muted-foreground whitespace-nowrap">
                    {fmtDate(order.created_at)}
                  </td>

                  <td className="pr-5 pl-4 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {order.checkout_url && order.status === "pending" && (
                        <CopyUrlButton url={order.checkout_url} />
                      )}
                      {order.status === "pending" && (
                        <CancelOrderButton orderId={order.id} />
                      )}
                      {order.status !== "paid" && (
                        <DeleteOrderButton orderId={order.id} />
                      )}
                    </div>
                  </td>
                </tr>

                {/* ── Expanded detail row ── */}
                {isExpanded && (
                  <tr key={`${order.id}-detail`} className={`${!isLast ? "border-b border-[var(--gbp-border)]" : ""}`}>
                    <td colSpan={8} className="px-6 pb-5 pt-1">
                      <div className={`rounded-xl border p-4 ${isPaid ? "border-emerald-200 bg-emerald-50/50" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)]"}`}>
                        {isPaid ? (
                          <>
                            <div className="grid gap-4 sm:grid-cols-3">
                              {/* Payment intent */}
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 rounded-lg bg-emerald-100 p-1.5">
                                  <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Intent</p>
                                  {order.stripe_payment_intent_id ? (
                                    <a
                                      href={`https://dashboard.stripe.com/${isTestMode ? "test/" : ""}payments/${order.stripe_payment_intent_id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-0.5 flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-700 hover:underline"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {order.stripe_payment_intent_id.slice(0, 24)}…
                                      <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                  ) : (
                                    <p className="mt-0.5 text-[11px] italic text-muted-foreground">No disponible</p>
                                  )}
                                </div>
                              </div>

                              {/* Customer email */}
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 rounded-lg bg-emerald-100 p-1.5">
                                  <Mail className="h-3.5 w-3.5 text-emerald-600" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email del cliente</p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-foreground">
                                    {order.customer_email ?? <span className="italic text-muted-foreground">No disponible</span>}
                                  </p>
                                </div>
                              </div>

                              {/* Paid at */}
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 rounded-lg bg-emerald-100 p-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fecha de pago</p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-foreground">
                                    {order.paid_at ? fmtDate(order.paid_at) : "—"}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Items breakdown for multi-item paid orders */}
                            {storedItems && storedItems.length > 1 && (
                              <ItemsBreakdown items={storedItems} currency={order.currency} />
                            )}
                          </>
                        ) : (
                          /* Non-paid detail */
                          <>
                            <div className="grid gap-4 sm:grid-cols-2">
                              {order.expires_at && (
                                <div className="flex items-start gap-2.5">
                                  <div className="mt-0.5 rounded-lg bg-[var(--gbp-surface)] p-1.5 border border-[var(--gbp-border)]">
                                    <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expira en</p>
                                    <div className="mt-0.5"><CountdownTimer expiresAt={order.expires_at} /></div>
                                  </div>
                                </div>
                              )}
                              {order.checkout_url && order.status === "pending" && (
                                <div className="flex items-start gap-2.5">
                                  <div className="mt-0.5 rounded-lg bg-[var(--gbp-surface)] p-1.5 border border-[var(--gbp-border)]">
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">URL de checkout</p>
                                    <p className="mt-0.5 truncate text-[11px] font-mono text-muted-foreground">{order.checkout_url}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Items breakdown for multi-item pending orders */}
                            {storedItems && storedItems.length > 1 && (
                              <ItemsBreakdown items={storedItems} currency={order.currency} />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
