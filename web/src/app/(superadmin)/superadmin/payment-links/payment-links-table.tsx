"use client";

import { useState } from "react";
import { CheckCircle2, Clock, XCircle, Ban, Zap, FileStack, Tag, ChevronDown, ExternalLink, Mail, CreditCard, Calendar } from "lucide-react";
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

type Order = {
  id: string;
  organization_id: string | null;
  description: string;
  internal_notes: string | null;
  amount_cents: number;
  currency: string;
  action_type: string;
  action_payload: unknown;
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
            const ac = ACTION_CONFIG[order.action_type as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.custom;
            const payload = order.action_payload as Record<string, unknown> | null;
            const isLast = i === orders.length - 1;
            const isExpanded = expandedId === order.id;
            const isPaid = order.status === "paid";

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
                        ) : (
                          /* Non-paid detail */
                          <div className="grid gap-4 sm:grid-cols-2">
                            {order.expires_at && (
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 rounded-lg bg-[var(--gbp-surface)] p-1.5 border border-[var(--gbp-border)]">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expira</p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-foreground">{fmtDate(order.expires_at)}</p>
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
