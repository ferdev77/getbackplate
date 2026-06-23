"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Clock, XCircle, Ban, TrendingUp, Building2, Plug, ChevronDown, Timer } from "lucide-react";
import { CopyUrlButton } from "./copy-url-button";
import { CancelSubscriptionOrderButton } from "./cancel-subscription-order-button";
import { DeleteSubscriptionOrderButton } from "./delete-subscription-order-button";
import { SendLinkEmailButton } from "./send-link-email-button";
import { sendSubscriptionLinkEmailAction } from "./actions";

const STATUS_CONFIG = {
  pending:   { label: "Pendiente",   cls: "text-amber-600  bg-amber-50  border-amber-200",   Icon: Clock },
  completed: { label: "Completado",  cls: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: CheckCircle2 },
  upgraded:  { label: "Actualizado", cls: "text-violet-600 bg-violet-50 border-violet-200",   Icon: TrendingUp },
  expired:   { label: "Expirado",    cls: "text-slate-500  bg-slate-50  border-slate-200",   Icon: XCircle },
  canceled:  { label: "Cancelado",   cls: "text-rose-500   bg-rose-50   border-rose-200",    Icon: Ban },
} as const;

const PLAN_KIND_CONFIG = {
  platform:    { label: "Plataforma",        Icon: Building2, cls: "text-violet-600" },
  integration: { label: "Integración QBO-R365", Icon: Plug,    cls: "text-sky-600" },
} as const;

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

type Order = {
  id: string;
  organization_id: string | null;
  plan_kind: string;
  plan_id: string;
  billing_period: string;
  include_setup_fee: boolean;
  extra_charge_cents: number | null;
  extra_charge_description: string | null;
  status: string;
  checkout_url: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  email_sent_to: string | null;
};

type Props = {
  orders: Order[];
  orgMap: Record<string, string>;
  planMap: Record<string, string>;
};

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

export function SubscriptionLinksTable({ orders, orgMap, planMap }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
            {["", "Organización", "Tipo", "Plan", "Período", "Estado", "Creado", ""].map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground first:pl-3 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order, i) => {
            const st = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            const kind = PLAN_KIND_CONFIG[order.plan_kind as keyof typeof PLAN_KIND_CONFIG] ?? PLAN_KIND_CONFIG.platform;
            const isLast = i === orders.length - 1;
            const isExpanded = expandedId === order.id;

            return (
              <>
                <tr
                  key={order.id}
                  onClick={() => toggle(order.id)}
                  className={`cursor-pointer transition-colors hover:bg-[var(--gbp-bg)] ${!isLast || isExpanded ? "border-b border-[var(--gbp-border)]" : ""} ${isExpanded ? "bg-[var(--gbp-bg)]" : ""}`}
                >
                  <td className="pl-3 pr-2 py-4 w-8">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </td>

                  <td className="px-4 py-4">
                    <p className="font-semibold text-foreground">
                      {orgMap[order.organization_id ?? ""] ?? <span className="italic text-muted-foreground">eliminada</span>}
                    </p>
                  </td>

                  <td className="px-4 py-4">
                    <div className={`flex items-center gap-1.5 ${kind.cls}`}>
                      <kind.Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[11px] font-semibold">{kind.label}</span>
                    </div>
                  </td>

                  <td className="px-4 py-4 font-medium text-foreground">
                    {planMap[order.plan_id] ?? <span className="italic text-muted-foreground">—</span>}
                  </td>

                  <td className="px-4 py-4 text-[11px] text-muted-foreground">
                    {order.billing_period === "yearly" ? "Anual" : "Mensual"}
                    {order.include_setup_fee && <span className="ml-1.5 text-amber-600">· +setup</span>}
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

                  <td className="pr-5 pl-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {order.checkout_url && order.status === "pending" && (
                        <CopyUrlButton url={order.checkout_url} />
                      )}
                      {order.checkout_url && order.status === "pending" && (
                        <SendLinkEmailButton orderId={order.id} sentTo={order.email_sent_to} action={sendSubscriptionLinkEmailAction} />
                      )}
                      {order.status === "pending" && (
                        <CancelSubscriptionOrderButton orderId={order.id} />
                      )}
                      {order.status !== "completed" && order.status !== "upgraded" && (
                        <DeleteSubscriptionOrderButton orderId={order.id} />
                      )}
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${order.id}-detail`} className={`${!isLast ? "border-b border-[var(--gbp-border)]" : ""}`}>
                    <td colSpan={8} className="px-6 pb-5 pt-1">
                      <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
                        {order.status === "upgraded" ? (
                          <p className="text-[11px] text-muted-foreground">
                            Cambio de plan aplicado al instante con prorateo — no se generó link de Stripe.
                            {order.completed_at && <> Aplicado el {fmtDate(order.completed_at)}.</>}
                          </p>
                        ) : order.status === "completed" ? (
                          <p className="text-[11px] text-muted-foreground">
                            Suscripción activada{order.completed_at ? ` el ${fmtDate(order.completed_at)}` : ""}.
                          </p>
                        ) : order.expires_at ? (
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 rounded-lg bg-[var(--gbp-surface)] p-1.5 border border-[var(--gbp-border)]">
                              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expira en</p>
                              <div className="mt-0.5"><CountdownTimer expiresAt={order.expires_at} /></div>
                            </div>
                          </div>
                        ) : null}
                        {order.extra_charge_cents != null && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Cargo único: <strong className="text-foreground">${(order.extra_charge_cents / 100).toFixed(2)}</strong>
                            {order.extra_charge_description && <> — {order.extra_charge_description}</>}
                          </p>
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
