"use client";

import { useState } from "react";

export type PlanFeature = {
  text: string;
  highlight?: boolean;
  everything?: boolean;
  annual_only?: boolean;
};

export type IntegrationPlan = {
  id: string;
  name: string;
  description: string | null;
  price_amount: number | null;
  currency_code: string | null;
  is_featured: boolean;
  is_enterprise: boolean;
  setup_fee_amount: number | null;
  setup_fee_annual_discount_pct: number | null;
  features: unknown;
  cta_text: string | null;
  cta_email: string | null;
  sort_order: number;
  // Resolved server-side from Stripe
  annual_per_month: number | null;
  annual_total: number | null;
  has_stripe_prices: boolean;
};

export function formatPrice(amount: number) {
  return amount.toLocaleString("en-US");
}

export function PlanCard({
  plan,
  isAnnual,
  onCheckout,
  onSeatRequest,
  checkoutLoading,
  showSetupFeeToggle,
  isCurrent = false,
  isSelected = false,
}: {
  plan: IntegrationPlan;
  isAnnual: boolean;
  onCheckout: (planId: string, period: "monthly" | "annual", includeSetupFee: boolean) => void;
  onSeatRequest: (email: string, planName: string) => void;
  checkoutLoading: string | null;
  /** Landing: informational only (no toggle, setup fee always applies). Bloqueante/settings: interactive checkbox. */
  showSetupFeeToggle: boolean;
  /** Shows a "Current" corner badge and disables the CTA. Only used inside the app (bloqueante / plan-change modal). */
  isCurrent?: boolean;
  /** Shows a "Selected" top badge (plan pre-chosen from the landing URL). Only used in the bloqueante. */
  isSelected?: boolean;
}) {
  const features = Array.isArray(plan.features) ? (plan.features as PlanFeature[]) : [];

  const monthlyPrice = plan.price_amount ?? 0;

  // Annual per-month: prefer Stripe-resolved value, fall back to ×10/12 computation
  const annualPerMonth = plan.annual_per_month ?? Math.round((monthlyPrice * 10) / 12);
  const annualTotal = plan.annual_total ?? monthlyPrice * 10;

  const displayPrice = isAnnual ? annualPerMonth : monthlyPrice;
  const savings = monthlyPrice * 12 - annualTotal;

  const isFeatured = plan.is_featured;
  const isEnterprise = plan.is_enterprise;
  const isLoading = checkoutLoading === plan.id;
  const [includeSetupFee, setIncludeSetupFee] = useState(true);

  const setupAmount = plan.setup_fee_amount;
  const setupText = setupAmount != null ? `$${formatPrice(setupAmount)}` : "Negotiated";
  const setupDiscountPct = plan.setup_fee_annual_discount_pct ?? 25;
  const annualSetupAmount = setupAmount == null
    ? null
    : setupAmount * (1 - setupDiscountPct / 100);

  function handleCta() {
    if (isCurrent) return;
    if (isEnterprise) {
      onSeatRequest(plan.cta_email ?? "", plan.name);
      return;
    }
    onCheckout(plan.id, isAnnual ? "annual" : "monthly", showSetupFeeToggle ? includeSetupFee : true);
  }

  const ctaLabel = isCurrent
    ? "Current plan"
    : isLoading
      ? "Redirecting…"
      : (plan.cta_text ?? (isEnterprise ? "Talk to Sales →" : "Get Started →"));

  return (
    <div className={`tier${isFeatured ? " dark" : ""}`}>
      {isFeatured ? (
        <span className="poptag">Most popular</span>
      ) : isSelected ? (
        <span className="poptag">Selected</span>
      ) : null}
      {isCurrent && <span className="poptag-current">Current</span>}

      <div className="tname">{plan.name}</div>
      <div className="tdesc">{plan.description ?? ""}</div>

      {isEnterprise ? (
        <>
          <div className="tprice custom">Custom</div>
          <div className="tbilled">Tailored to your operation</div>
        </>
      ) : (
        <>
          <div className="tprice">
            ${formatPrice(displayPrice)}
            <span className="per">/mo</span>
          </div>
          <div className="tbilled">
            {isAnnual ? `Billed annually · $${formatPrice(annualTotal)}/yr` : "Billed monthly"}
          </div>
          {isAnnual && savings > 0 && (
            <div className="savebadge">Save ${formatPrice(savings)} per year</div>
          )}
        </>
      )}

      <div className="setup">
        {showSetupFeeToggle ? (
          <label className="setup-row">
            {!isEnterprise && setupAmount != null ? (
              <input
                type="checkbox"
                checked={includeSetupFee}
                onChange={(event) => setIncludeSetupFee(event.target.checked)}
                aria-label={`Include setup fee for ${plan.name}`}
              />
            ) : null}
            <span className="tsetup-lab">Setup fee</span>
            {isAnnual && annualSetupAmount != null ? (
              <span className="tsetup-amt">
                <s className="tsetup-strike">{setupText}</s>{" "}
                <span className="tsetup-waived">${formatPrice(annualSetupAmount)} (-{setupDiscountPct}%)</span>
              </span>
            ) : (
              <span className="tsetup-amt">{setupText}</span>
            )}
          </label>
        ) : (
          <div className="setup-row">
            <span className="tsetup-lab">Setup fee</span>
            {isAnnual && annualSetupAmount != null ? (
              <span className="tsetup-amt">
                <s className="tsetup-strike">{setupText}</s>{" "}
                <span className="tsetup-waived">${formatPrice(annualSetupAmount)} (-{setupDiscountPct}%)</span>{" "}
                (optional)
              </span>
            ) : (
              <span className="tsetup-amt">{setupText} (optional)</span>
            )}
          </div>
        )}
      </div>

      <ul className="feat">
        {features
          .filter((f) => !f.annual_only || isAnnual)
          .map((feature, i) => (
            <li key={i} className={feature.everything ? "head" : undefined}>
              <span className="ck">{feature.everything ? "+" : "✓"}</span>
              <span className="txt" style={{ fontWeight: feature.everything || feature.highlight ? 700 : 400 }}>
                {feature.text}
              </span>
            </li>
          ))}
      </ul>

      <button
        onClick={handleCta}
        disabled={isLoading || isCurrent}
        className={`tbtn${isFeatured ? " solid" : ""}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

export const PLAN_CARD_STYLES = `
.int-landing{
  --accent:#D4531A; --accent-light:#FCE9DF; --accent-dark:#A23E12; --accent-2:#F0843F;
  --bg:#F7F8FC; --surface:#FFFFFF; --ink:#14151A; --text:#14151A;
  --text-secondary:#595B66; --text-muted:#8A8C95;
  --border:#E6E8EE; --border-strong:#D6D8E0;
  --success:#15803D; --success-bg:#E7F5EC;
  --radius-sm:6px; --radius:10px; --radius-lg:16px; --radius-xl:22px;
  font-family:var(--font-jakarta,'Plus Jakarta Sans',system-ui,-apple-system,sans-serif);
}
.int-landing *{box-sizing:border-box;}
.int-landing .mono{font-family:var(--font-mono,'JetBrains Mono',ui-monospace,monospace);}

/* TIERS */
.int-landing .tiers{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:stretch;}
@media(max-width:940px){.int-landing .tiers{grid-template-columns:repeat(2,1fr);}}
@media(max-width:560px){.int-landing .tiers{grid-template-columns:1fr;}}
.int-landing .tier{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px 20px;display:flex;flex-direction:column;position:relative;transition:transform .2s ease,box-shadow .2s ease;}
.int-landing .tier:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(20,21,26,.08);}
.int-landing .tier.dark{background:var(--ink);border-color:var(--ink);}
.int-landing .tier.dark:hover{box-shadow:0 16px 40px rgba(20,21,26,.28);}
.int-landing .tier.dark .tname,.int-landing .tier.dark .tprice{color:#fff;}
.int-landing .tier.dark .tdesc,.int-landing .tier.dark .tbilled,.int-landing .tier.dark li .txt{color:#B9C0C9;}
.int-landing .tier.dark .setup{border-color:rgba(255,255,255,.16);}
.int-landing .poptag{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 11px;border-radius:12px;white-space:nowrap;}
.int-landing .poptag-current{position:absolute;top:-11px;right:12px;background:var(--success);color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 11px;border-radius:12px;white-space:nowrap;}
.int-landing .tname{font-size:19px;font-weight:800;letter-spacing:-.01em;}
.int-landing .tdesc{font-size:12.5px;color:var(--text-secondary);margin-top:5px;line-height:1.45;min-height:34px;}
.int-landing .tprice{margin-top:16px;font-size:38px;font-weight:800;letter-spacing:-.03em;line-height:1;}
.int-landing .tprice .per{font-size:14px;font-weight:600;color:var(--text-secondary);letter-spacing:0;}
.int-landing .tprice.custom{font-size:26px;}
.int-landing .tbilled{font-size:12px;color:var(--text-muted);margin-top:6px;min-height:16px;}
.int-landing .savebadge{display:inline-block;font-size:12px;font-weight:600;color:var(--success);background:var(--success-bg);padding:3px 8px;border-radius:4px;margin-top:8px;}
.int-landing .setup{margin-top:16px;padding-top:14px;border-top:1px dashed var(--border-strong);}
.int-landing .setup-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
.int-landing .tsetup-lab{font-size:12.5px;color:var(--text-secondary);font-weight:600;}
.int-landing .tier.dark .tsetup-lab{color:#DDE2E8;}
.int-landing .tsetup-amt{font-family:var(--font-mono,monospace);font-size:13px;font-weight:700;color:var(--text);}
.int-landing .tier.dark .tsetup-amt{color:#fff;}
.int-landing .tsetup-strike{text-decoration:line-through;color:var(--text-muted);font-weight:400;}
.int-landing .tsetup-waived{color:var(--success);}
.int-landing ul.feat{margin-top:16px;display:flex;flex-direction:column;gap:9px;flex:1;}
.int-landing ul.feat li{font-size:13px;display:flex;gap:8px;align-items:flex-start;line-height:1.4;}
.int-landing ul.feat li .ck{color:var(--accent);font-weight:700;flex:none;font-size:12px;margin-top:1px;}
.int-landing ul.feat li .txt{color:var(--text-secondary);}
.int-landing ul.feat li.head{margin-top:4px;padding-top:12px;border-top:1px dashed var(--border-strong);}
.int-landing .tier.dark ul.feat li.head{border-color:rgba(255,255,255,.14);}
.int-landing ul.feat li.head .txt{font-weight:700;color:var(--text);}
.int-landing .tier.dark ul.feat li.head .txt{color:#fff;}
.int-landing .tbtn{margin-top:20px;display:block;width:100%;text-align:center;font-size:14px;font-weight:700;padding:12px;border-radius:var(--radius);text-decoration:none;transition:.15s;border:1px solid var(--border-strong);color:var(--text);background:transparent;font-family:inherit;cursor:pointer;}
.int-landing .tbtn:hover{border-color:var(--text);}
.int-landing .tier.dark .tbtn{border-color:rgba(255,255,255,.25);color:#fff;}
.int-landing .tbtn.solid{background:var(--accent);border-color:var(--accent);color:#fff;}
.int-landing .tbtn.solid:hover{background:var(--accent-dark);}
.int-landing .tbtn:disabled{opacity:.7;cursor:wait;}
`;
