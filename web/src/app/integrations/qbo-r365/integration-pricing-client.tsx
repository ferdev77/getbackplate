"use client";

import { useState } from "react";

type PlanFeature = {
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
  features: unknown;
  cta_text: string | null;
  cta_email: string | null;
  sort_order: number;
  // Resolved server-side from Stripe
  annual_per_month: number | null;
  annual_total: number | null;
  has_stripe_prices: boolean;
};

function formatPrice(amount: number) {
  return amount.toLocaleString("en-US");
}

function CheckIcon({ dark }: { dark?: boolean }) {
  return (
    <svg
      style={{
        flexShrink: 0,
        width: 18,
        height: 18,
        marginTop: 2,
        background: dark ? "rgba(194,74,30,0.2)" : "#FCE9DD",
        borderRadius: "50%",
      }}
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M1.5 5L4 7.5L8.5 2.5"
        stroke={dark ? "#FCB69D" : "#C24A1E"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon({ dark }: { dark?: boolean }) {
  return (
    <svg
      style={{
        flexShrink: 0,
        width: 18,
        height: 18,
        marginTop: 2,
        background: dark ? "rgba(194,74,30,0.2)" : "#FCE9DD",
        borderRadius: "50%",
      }}
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M5 1V9M1 5H9"
        stroke={dark ? "#FCB69D" : "#C24A1E"}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlanCard({
  plan,
  isAnnual,
  onCheckout,
  checkoutLoading,
}: {
  plan: IntegrationPlan;
  isAnnual: boolean;
  onCheckout: (planId: string, period: "monthly" | "annual") => void;
  checkoutLoading: string | null;
}) {
  const features = Array.isArray(plan.features) ? (plan.features as PlanFeature[]) : [];

  const monthlyPrice = plan.price_amount ?? 0;

  // Annual per-month: prefer Stripe-resolved value, fall back to ×10/12 computation
  const annualPerMonth =
    plan.annual_per_month ?? Math.round((monthlyPrice * 10) / 12);
  const annualTotal = plan.annual_total ?? monthlyPrice * 10;

  const displayPrice = isAnnual ? annualPerMonth : monthlyPrice;
  const savings = monthlyPrice * 12 - annualTotal;

  const isFeatured = plan.is_featured;
  const isEnterprise = plan.is_enterprise;
  const isLoading = checkoutLoading === plan.id;

  const textLight = isFeatured ? "#A8A39B" : "#6B6760";
  const textMuted = isFeatured ? "#A8A39B" : "#9B968D";
  const borderColor = isFeatured ? "#2A2A26" : "#E5DFD3";

  const setupAmount = plan.setup_fee_amount;
  const setupText =
    setupAmount != null ? `$${formatPrice(setupAmount)} one-time` : "Negotiated";

  // CTA: Stripe checkout for priced plans, mailto for enterprise or plans without stripe
  function handleCta() {
    if (isEnterprise || !plan.has_stripe_prices) {
      const email = plan.cta_email ?? "angelo@mkthelp.com";
      window.location.href = `mailto:${email}?subject=QBO R365 - ${plan.name} Plan`;
      return;
    }
    onCheckout(plan.id, isAnnual ? "annual" : "monthly");
  }

  const ctaLabel = plan.cta_text ?? (isEnterprise ? "Talk to Sales →" : "Get Started →");

  return (
    <div
      className={`int-plan-card${isFeatured ? " featured" : ""}`}
      style={{
        background: isFeatured ? "#161614" : isEnterprise ? "transparent" : "#FFFFFF",
        border: `1px ${isEnterprise ? "dashed" : "solid"} ${isFeatured ? "#2A2A26" : "#E5DFD3"}`,
        borderRadius: 18,
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        color: isFeatured ? "#F7F4EE" : "#161614",
      }}
    >
      {isFeatured && (
        <span
          style={{
            position: "absolute",
            top: -12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#C24A1E",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "5px 12px",
            borderRadius: 100,
            whiteSpace: "nowrap",
          }}
        >
          Most Popular
        </span>
      )}

      <div
        style={{
          fontFamily: "var(--font-fraunces, serif)",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginBottom: 6,
        }}
      >
        {plan.name}
      </div>

      <div style={{ fontSize: 13, color: textLight, marginBottom: 24, minHeight: 36 }}>
        {plan.description ?? ""}
      </div>

      {/* Price block */}
      <div
        style={{
          marginBottom: 24,
          paddingBottom: 24,
          borderBottom: `1px solid ${borderColor}`,
          minHeight: 142,
        }}
      >
        {isEnterprise ? (
          <>
            <div
              style={{
                fontFamily: "var(--font-fraunces, serif)",
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              Custom
            </div>
            <div style={{ fontSize: 14, color: textLight, marginTop: 4 }}>
              tailored to your operation
            </div>
            <div style={{ fontSize: 13, color: textMuted, marginTop: 6 }}>&nbsp;</div>
          </>
        ) : (
          <>
            <div
              style={{
                fontFamily: "var(--font-fraunces, serif)",
                fontSize: 52,
                fontWeight: 600,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                display: "flex",
                alignItems: "baseline",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 500,
                  color: textLight,
                  alignSelf: "flex-start",
                  paddingTop: 8,
                }}
              >
                $
              </span>
              <span>{formatPrice(displayPrice)}</span>
            </div>
            <div style={{ fontSize: 14, color: textLight, marginTop: 4 }}>per month</div>
            <div style={{ fontSize: 13, color: textMuted, marginTop: 6 }}>
              {isAnnual ? `Billed $${formatPrice(annualTotal)}/year` : "Billed monthly"}
            </div>
            {isAnnual && savings > 0 && (
              <div
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isFeatured ? "#7FD89D" : "#2D7A4A",
                  background: isFeatured
                    ? "rgba(80,200,120,0.15)"
                    : "rgba(45,122,74,0.1)",
                  padding: "3px 8px",
                  borderRadius: 4,
                  marginTop: 8,
                }}
              >
                Save ${formatPrice(savings)} per year
              </div>
            )}
          </>
        )}
      </div>

      {/* Setup row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0",
          marginBottom: 24,
          fontSize: 13,
          borderBottom: `1px dashed ${borderColor}`,
        }}
      >
        <span style={{ color: textLight, fontWeight: 500 }}>Setup fee</span>
        {isAnnual && setupAmount != null ? (
          <span style={{ fontWeight: 600 }}>
            <span
              style={{
                textDecoration: "line-through",
                color: textMuted,
                fontWeight: 400,
                marginRight: 6,
              }}
            >
              {setupText}
            </span>
            <span style={{ color: isFeatured ? "#7FD89D" : "#2D7A4A" }}>Waived</span>
          </span>
        ) : (
          <span style={{ fontWeight: 600 }}>{setupText}</span>
        )}
      </div>

      {/* Features list */}
      <ul style={{ listStyle: "none", flexGrow: 1, marginBottom: 24, padding: 0 }}>
        {features
          .filter((f) => !f.annual_only || isAnnual)
          .map((feature, i) => (
            <li
              key={i}
              style={{
                padding: "8px 0",
                fontSize: 14,
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                lineHeight: 1.45,
                fontWeight: feature.everything ? 700 : feature.highlight ? 600 : 400,
                ...(feature.everything
                  ? {
                      marginTop: 6,
                      paddingTop: 14,
                      borderTop: `1px dashed ${borderColor}`,
                    }
                  : {}),
              }}
            >
              {feature.everything ? (
                <PlusIcon dark={isFeatured} />
              ) : (
                <CheckIcon dark={isFeatured} />
              )}
              {feature.text}
            </li>
          ))}
      </ul>

      {/* CTA */}
      <button
        onClick={handleCta}
        disabled={isLoading}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "14px 24px",
          borderRadius: 100,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
          cursor: isLoading ? "wait" : "pointer",
          transition: "all 0.2s ease",
          fontFamily: "inherit",
          opacity: isLoading ? 0.7 : 1,
          ...(isFeatured
            ? { background: "#C24A1E", color: "white", border: "none" }
            : {
                background: "transparent",
                color: "#161614",
                border: "1.5px solid #161614",
              }),
        }}
      >
        {isLoading ? "Redirecting…" : ctaLabel}
      </button>
    </div>
  );
}

const CARD_STYLES = `
  .int-plan-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .int-plan-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 32px rgba(22,22,20,0.08);
  }
  .int-plan-card.featured:hover {
    box-shadow: 0 16px 40px rgba(22,22,20,0.22);
  }
`;

export function IntegrationPricingClient({ plans }: { plans: IntegrationPlan[] }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout(planId: string, period: "monthly" | "annual") {
    setCheckoutLoading(planId);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/stripe/checkout-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingPeriod: period }),
      });

      if (res.status === 401) {
        window.location.href = `/auth/register?returnTo=${encodeURIComponent("/integrations/qbo-r365")}`;
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error ?? "Error initiating checkout.");
        setCheckoutLoading(null);
      }
    } catch {
      setCheckoutError("Network error. Please try again.");
      setCheckoutLoading(null);
    }
  }

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: CARD_STYLES }} />
    <div
      style={{
        fontFamily:
          "var(--font-inter-tight, 'Inter Tight', -apple-system, system-ui, sans-serif)",
        background: "#F7F4EE",
        color: "#161614",
        lineHeight: 1.55,
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      {/* Header */}
      <header style={{ padding: "24px 0", borderBottom: "1px solid #E5DFD3" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <a href="/" style={{ textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/getbackplate-logo-light.svg"
              alt="GetBackplate"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </a>
          <nav style={{ display: "flex" }}>
            {(
              [
                ["Platform", "/"],
                ["Integrations", "/integrations/qbo-r365"],
              ] as [string, string][]
            ).map(([label, href]) => (
              <a
                key={label}
                href={href}
                style={{
                  color: "#6B6760",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: 15,
                  marginLeft: 28,
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "80px 0 56px", textAlign: "center" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#C24A1E",
              background: "#FCE9DD",
              padding: "6px 14px",
              borderRadius: 100,
              marginBottom: 24,
            }}
          >
            QBO ↔ R365 Integration
          </span>

          <h1
            style={{
              fontFamily: "var(--font-fraunces, serif)",
              fontSize: "clamp(40px, 6vw, 72px)",
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              marginBottom: 24,
              maxWidth: 900,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            The only native connector between{" "}
            <em style={{ fontStyle: "italic", color: "#C24A1E", fontWeight: 500 }}>
              QuickBooks Online
            </em>{" "}
            and{" "}
            <em style={{ fontStyle: "italic", color: "#C24A1E", fontWeight: 500 }}>
              Restaurant365
            </em>
            .
          </h1>

          <p
            style={{
              fontSize: 19,
              color: "#6B6760",
              maxWidth: 640,
              margin: "0 auto 40px",
              lineHeight: 1.5,
            }}
          >
            Built for food vendors and distributors selling to R365 restaurants. Send
            invoices and credit memos automatically, in real time, from your QuickBooks
            Online directly to your customers&apos; R365.
          </p>

          {/* Billing toggle */}
          <div
            style={{ display: "inline-flex", alignItems: "center", gap: 16, marginBottom: 10 }}
          >
            <button
              onClick={() => setIsAnnual(false)}
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: isAnnual ? "#9B968D" : "#161614",
                cursor: "pointer",
                userSelect: "none",
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                transition: "color 0.25s ease",
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              aria-label="Toggle billing period"
              style={{
                width: 54,
                height: 30,
                background: isAnnual ? "#161614" : "#D9D5CC",
                border: "none",
                borderRadius: 100,
                position: "relative",
                cursor: "pointer",
                transition: "background 0.3s ease",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: 3,
                  width: 24,
                  height: 24,
                  background: "white",
                  borderRadius: "50%",
                  boxShadow: "0 2px 4px rgba(22,22,20,0.18)",
                  transition: "transform 0.3s cubic-bezier(0.25,0.1,0.25,1)",
                  transform: isAnnual ? "translateX(24px)" : "translateX(0)",
                  display: "block",
                }}
              />
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: isAnnual ? "#161614" : "#9B968D",
                cursor: "pointer",
                userSelect: "none",
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                transition: "color 0.25s ease",
              }}
            >
              Annual{" "}
              <span
                style={{
                  display: "inline-block",
                  background: "#2D7A4A",
                  color: "white",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "3px 8px",
                  borderRadius: 4,
                  marginLeft: 6,
                  verticalAlign: "1px",
                }}
              >
                2 MONTHS FREE
              </span>
            </button>
          </div>

          <div style={{ fontSize: 13, color: "#9B968D", marginTop: 12 }}>
            Annual billing = pay 10 months, get 12. Setup fee waived.
          </div>
        </div>
      </section>

      {/* Checkout error banner */}
      {checkoutError && (
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto 24px",
            padding: "0 32px",
          }}
        >
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 12,
              padding: "12px 20px",
              color: "#B91C1C",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {checkoutError}
          </div>
        </div>
      )}

      {/* Pricing grid */}
      <section style={{ padding: "56px 0 80px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
            style={{ alignItems: "stretch" }}
          >
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isAnnual={isAnnual}
                onCheckout={handleCheckout}
                checkoutLoading={checkoutLoading}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Extras */}
      <section style={{ padding: "60px 0", borderTop: "1px solid #E5DFD3" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {(
              [
                {
                  icon: "✦",
                  title: "Setup waived on annual.",
                  desc: "Commit annually and we waive the one-time setup fee — that's up to $5,000 in your pocket. You also lock in your rate forever.",
                },
                {
                  icon: "∞",
                  title: "Scale across multiple R365 customers.",
                  desc: "Each plan supports a defined number of R365 customer connections. Add more anytime — no full plan upgrade needed if you only add one or two.",
                },
                {
                  icon: "⚡",
                  title: "Real-time, not delayed.",
                  desc: "The moment you finalize and send an invoice in QuickBooks Online, it lands in your customer's R365. No exports, no manual uploads.",
                },
              ] as { icon: string; title: string; desc: string }[]
            ).map((extra) => (
              <div key={extra.title}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    background: "#FCE9DD",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    color: "#C24A1E",
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {extra.icon}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-fraunces, serif)",
                    fontSize: 22,
                    fontWeight: 600,
                    marginBottom: 12,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {extra.title}
                </h3>
                <p style={{ color: "#6B6760", fontSize: 15, lineHeight: 1.55 }}>
                  {extra.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notes */}
      <section
        style={{
          padding: "40px 0 80px",
          borderTop: "1px solid #E5DFD3",
          fontSize: 13,
          color: "#9B968D",
          lineHeight: 1.8,
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>
          {(
            [
              [
                "About overage:",
                "If you exceed your monthly invoice allowance, additional invoices are billed at the per-invoice rate of your plan. No overage on Scale annual plans.",
              ],
              [
                "About R365 customer connections:",
                "Each connection represents one Restaurant365 customer (restaurant group or location) that receives your invoices. Each has its own configuration: vendor name in their R365, account number, FTP credentials, and item catalog mapping.",
              ],
              [
                "Adding connections beyond your plan:",
                "$500 one-time setup + $99/mo per additional connection ($79/mo on Scale). Grow gradually without changing plans — until the math points to an upgrade naturally.",
              ],
              [
                "About setup:",
                "Includes initial configuration, FTP setup with R365 Support, item catalog mapping, test transactions, and go-live monitoring. Typically completed within 5 business days from kickoff.",
              ],
              [
                "Standalone product:",
                "No GetBackplate platform subscription required to use the QBO ↔ R365 integration.",
              ],
            ] as [string, string][]
          ).map(([label, text], i) => (
            <p key={label} style={{ marginTop: i === 0 ? 0 : 14 }}>
              <strong style={{ color: "#6B6760" }}>{label}</strong> {text}
            </p>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
