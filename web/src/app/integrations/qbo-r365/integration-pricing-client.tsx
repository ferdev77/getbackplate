"use client";

import Link from "next/link";
import { useState } from "react";
import { RequestSeatModal } from "@/modules/landing/ui/request-seat-modal";

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

const MARQUEE_ITEMS = [
  "Food Distributors",
  "Beverage Suppliers",
  "Produce Vendors",
  "Meat & Seafood Purveyors",
  "Bakery & Pastry Suppliers",
  "Coffee Roasters",
  "Dairy Distributors",
  "Specialty Food Providers",
  "Janitorial & Cleaning Suppliers",
  "Disposables & Packaging Suppliers",
  "Uniform & Linen Suppliers",
];

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Who pays — the vendor or the restaurant?",
    a: "The vendor or distributor sending the invoices pays. Your restaurant customers receive invoices into their Restaurant365 at no cost — and if you're a restaurant, you can refer a vendor to get set up for free.",
  },
  {
    q: "How fast do invoices arrive in Restaurant365?",
    a: "Every invoice is picked up automatically the moment you finalize it in QuickBooks® Online and delivered to your customer's Restaurant365 on its next import — no manual steps, no waiting on email.",
  },
  {
    q: "Do credit memos get delivered too, not just invoices?",
    a: "Yes. When you finalize an invoice or a credit memo in QuickBooks® Online, it's delivered to your customer's Restaurant365 automatically — no re-keying and no email attachments. Each document is delivered as finalized in QuickBooks® Online.",
  },
  {
    q: "Do I have to change how I use QuickBooks® Online?",
    a: "No. You keep invoicing in QuickBooks® Online exactly as you do today. Once connected, delivery happens in the background on every invoice.",
  },
  {
    q: "Is my QuickBooks® Online data secure?",
    a: (
      <>
        Yes. Your connection is authorized through QuickBooks® Online&apos;s secure OAuth flow,
        credentials are encrypted, and you can disconnect at any time. See our{" "}
        <Link href="/trust">Trust Center</Link> for details.
      </>
    ),
  },
  {
    q: "I'm a restaurant — my vendor isn't set up. What do I do?",
    a: "Refer them and we'll reach out and handle the setup so their invoices start landing in your Restaurant365 automatically — at no cost to you.",
  },
  {
    q: "Does this work with desktop accounting software?",
    a: "This integration is built for QuickBooks® Online. If you use desktop accounting software, reach out and we'll let you know what's possible.",
  },
];

function formatPrice(amount: number) {
  return amount.toLocaleString("en-US");
}

function PlanCard({
  plan,
  isAnnual,
  onCheckout,
  onSeatRequest,
  checkoutLoading,
}: {
  plan: IntegrationPlan;
  isAnnual: boolean;
  onCheckout: (planId: string, period: "monthly" | "annual") => void;
  onSeatRequest: (email: string, planName: string) => void;
  checkoutLoading: string | null;
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

  const setupAmount = plan.setup_fee_amount;
  const setupText = setupAmount != null ? `$${formatPrice(setupAmount)}` : "Negotiated";

  function handleCta() {
    if (isEnterprise) {
      onSeatRequest(plan.cta_email ?? "", plan.name);
      return;
    }
    onCheckout(plan.id, isAnnual ? "annual" : "monthly");
  }

  const ctaLabel = plan.cta_text ?? (isEnterprise ? "Talk to Sales →" : "Get Started →");

  return (
    <div className={`tier${isFeatured ? " dark" : ""}`}>
      {isFeatured && <span className="poptag">Most popular</span>}

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
        <div className="setup-row">
          <span className="tsetup-lab">Setup fee</span>
          {isAnnual && setupAmount != null ? (
            <span className="tsetup-amt">
              <s className="tsetup-strike">{setupText}</s> <span className="tsetup-waived">Waived</span>
            </span>
          ) : (
            <span className="tsetup-amt">{setupText}</span>
          )}
        </div>
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
        disabled={isLoading}
        className={`tbtn${isFeatured ? " solid" : ""}`}
      >
        {isLoading ? "Redirecting…" : ctaLabel}
      </button>
    </div>
  );
}

const STYLES = `
.int-landing{
  --accent:#D4531A; --accent-light:#FCE9DF; --accent-dark:#A23E12; --accent-2:#F0843F;
  --bg:#F7F8FC; --surface:#FFFFFF; --ink:#14151A; --text:#14151A;
  --text-secondary:#595B66; --text-muted:#8A8C95;
  --border:#E6E8EE; --border-strong:#D6D8E0;
  --success:#15803D; --success-bg:#E7F5EC;
  --radius-sm:6px; --radius:10px; --radius-lg:16px; --radius-xl:22px;
  font-family:var(--font-jakarta,'Plus Jakarta Sans',system-ui,-apple-system,sans-serif);
  background:var(--bg); color:var(--text); line-height:1.6;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
}
.int-landing *{box-sizing:border-box;}
.int-landing h1,.int-landing h2,.int-landing h3,.int-landing p,.int-landing ul{margin:0;padding:0;}
.int-landing ul{list-style:none;}
.int-landing a{color:inherit;}
.int-landing .mono{font-family:var(--font-mono,'JetBrains Mono',ui-monospace,monospace);}
.int-landing .container{max-width:1180px;margin:0 auto;padding:0 24px;}
.int-landing section[id]{scroll-margin-top:78px;}

/* NAV */
.int-landing .nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.86);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);}
.int-landing .nav-inner{max-width:1180px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;}
.int-landing .logo{display:inline-flex;text-decoration:none;}
.int-landing .navlinks{display:flex;align-items:center;gap:28px;}
@media(max-width:760px){.int-landing .navlinks{display:none;}}
.int-landing .navlinks a{font-size:14px;font-weight:600;color:var(--text-secondary);text-decoration:none;transition:.15s;}
.int-landing .navlinks a:hover{color:var(--text);}
.int-landing .nav-btns{display:flex;align-items:center;gap:10px;}
.int-landing .nav-ghost{font-size:14px;font-weight:700;color:var(--accent);text-decoration:none;padding:9px 14px;border:1px solid var(--accent-light);border-radius:8px;white-space:nowrap;transition:.15s;}
.int-landing .nav-ghost:hover{background:var(--accent-light);}
@media(max-width:760px){.int-landing .nav-ghost{display:none;}}
.int-landing .nav-cta{background:var(--accent);color:#fff;font-size:14px;font-weight:700;padding:9px 16px;border-radius:8px;text-decoration:none;transition:.15s;white-space:nowrap;}
.int-landing .nav-cta:hover{background:var(--accent-dark);}

/* HERO */
.int-landing .hero{padding:62px 0 40px;background:linear-gradient(180deg,#FFFFFF 0%,var(--bg) 100%);}
.int-landing .hero-grid{display:grid;grid-template-columns:1fr 1.05fr;gap:56px;align-items:center;}
@media(max-width:900px){.int-landing .hero-grid{grid-template-columns:1fr;gap:36px;}}
.int-landing .badge{display:inline-flex;align-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:7px 15px;border-radius:20px;margin-bottom:26px;}
.int-landing .h1{font-size:56px;line-height:1.03;font-weight:800;letter-spacing:-.035em;color:var(--text);}
.int-landing .h1 .fix{background:linear-gradient(100deg,#A23E12 0%,#D4531A 45%,#F0843F 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;}
@media(max-width:900px){.int-landing .h1{font-size:42px;}}
.int-landing .lead{margin-top:22px;font-size:17px;line-height:1.6;color:var(--text-secondary);max-width:460px;}

.int-landing .module{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;box-shadow:0 1px 2px rgba(20,21,26,.04),0 12px 40px rgba(20,21,26,.06);}
.int-landing .tabs{display:grid;grid-template-columns:1fr 1fr;}
.int-landing .tab{padding:20px 24px;background:var(--bg);border:none;border-bottom:2px solid transparent;text-align:left;cursor:pointer;font-family:inherit;transition:.15s;}
.int-landing .tab.active{background:var(--surface);border-bottom-color:var(--accent);}
.int-landing .tab .tt{font-size:17px;font-weight:700;letter-spacing:-.01em;color:var(--text-muted);}
.int-landing .tab.active .tt{color:var(--accent);}
.int-landing .tab .ts{font-size:12.5px;color:var(--text-muted);margin-top:2px;}
.int-landing .tab.active .ts{color:var(--text-secondary);}
.int-landing .panel{padding:26px 26px 28px;display:none;}
.int-landing .panel.active{display:block;}
.int-landing .pill{display:inline-flex;align-items:center;background:var(--accent);color:#fff;font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;letter-spacing:.04em;padding:5px 11px;border-radius:16px;margin-bottom:16px;}
.int-landing .pline{font-size:17px;font-weight:600;letter-spacing:-.01em;color:var(--text);margin-bottom:18px;line-height:1.4;}
.int-landing .feed{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.int-landing .feed-h{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);}
.int-landing .feed-h .dots{display:flex;gap:4px;}
.int-landing .feed-h .dots i{width:7px;height:7px;border-radius:50%;background:#C9D2D9;display:block;}
.int-landing .feed-h .ftitle{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);}
.int-landing .inv{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-top:1px solid var(--border);}
.int-landing .inv:first-of-type{border-top:none;}
.int-landing .inv .il .in{font-size:14px;font-weight:700;color:var(--text);}
.int-landing .inv .il .im{font-family:var(--font-mono,monospace);font-size:12px;color:var(--text-muted);margin-top:2px;}
.int-landing .stat{font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;padding:4px 10px;border-radius:14px;white-space:nowrap;background:var(--success-bg);color:var(--success);}
.int-landing .refbox{margin-top:16px;background:var(--accent-light);border-radius:var(--radius-lg);padding:16px 18px;}
.int-landing .refbox .rt{font-size:14px;font-weight:700;color:var(--accent-dark);}
.int-landing .refbox .rd{font-size:13.5px;color:var(--text-secondary);margin-top:3px;line-height:1.5;}
.int-landing .pcta{margin-top:20px;}
.int-landing .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:700;padding:13px 22px;border-radius:var(--radius);text-decoration:none;transition:.15s;font-family:inherit;cursor:pointer;border:none;width:100%;}
.int-landing .btn.primary{background:var(--accent);color:#fff;}
.int-landing .btn.primary:hover{background:var(--accent-dark);}
.int-landing .btn.inert{background:var(--accent-light);color:var(--accent-dark);cursor:default;}

/* MARQUEE */
.int-landing .marquee{display:flex;align-items:center;background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);overflow:hidden;}
.int-landing .marquee-label{flex:none;font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--text);padding:16px 24px;white-space:nowrap;position:relative;z-index:2;}
.int-landing .marquee-vp{overflow:hidden;flex:1;-webkit-mask-image:linear-gradient(to right,transparent,#000 52px,#000 calc(100% - 52px),transparent);mask-image:linear-gradient(to right,transparent,#000 52px,#000 calc(100% - 52px),transparent);}
.int-landing .marquee-track{display:inline-flex;align-items:center;white-space:nowrap;animation:int-scroll 40s linear infinite;}
.int-landing .marquee:hover .marquee-track{animation-play-state:paused;}
.int-landing .marquee-track .cat{font-size:15px;font-weight:700;color:#37414A;padding:16px 0;}
.int-landing .marquee-track .cat.o{color:var(--accent);}
.int-landing .marquee-track .sep{color:var(--border-strong);padding:0 22px;font-weight:600;font-size:15px;}
@keyframes int-scroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}

/* SECTIONS */
.int-landing .section{padding:80px 0;}
.int-landing .sec-head{text-align:center;max-width:640px;margin:0 auto 32px;}
.int-landing .eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);}
.int-landing .h2{font-size:34px;font-weight:800;letter-spacing:-.03em;margin-top:8px;line-height:1.12;}
.int-landing .sec-sub{margin-top:12px;font-size:15.5px;color:var(--text-secondary);}

/* CASE STUDY */
.int-landing .case{background:var(--bg);border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
.int-landing .case-grid{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;}
@media(max-width:820px){.int-landing .case-grid{grid-template-columns:1fr;gap:28px;}}
.int-landing .case .plive{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--success);}
.int-landing .case .plive .pulse{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:int-pulse 2s infinite;}
@keyframes int-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5);}70%{box-shadow:0 0 0 8px rgba(34,197,94,0);}100%{box-shadow:0 0 0 0 rgba(34,197,94,0);}}
.int-landing .case h3{font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:12px;line-height:1.14;}
.int-landing .case p{margin-top:14px;font-size:15.5px;color:var(--text-secondary);line-height:1.6;max-width:460px;}
.int-landing .metrics{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.int-landing .metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:22px 20px;}
.int-landing .metric .mn{font-family:var(--font-mono,monospace);font-size:32px;font-weight:700;letter-spacing:-.02em;background:linear-gradient(100deg,#A23E12 0%,#D4531A 45%,#F0843F 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;}
.int-landing .metric .mk{font-size:13px;color:var(--text-secondary);margin-top:4px;font-weight:600;}

/* COLOR BANNER */
.int-landing .cbanner{position:relative;overflow:hidden;text-align:center;padding:52px 24px;background:linear-gradient(115deg,#A23E12 0%,#D4531A 32%,#F0843F 58%,#D4531A 80%,#A23E12 100%);background-size:280% 280%;animation:int-grad 9s ease infinite;}
@keyframes int-grad{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}
.int-landing .cbanner::before,.int-landing .cbanner::after{content:"";position:absolute;border-radius:50%;filter:blur(50px);opacity:.4;}
.int-landing .cbanner::before{width:280px;height:280px;background:#FFD9BF;top:-120px;left:8%;}
.int-landing .cbanner::after{width:240px;height:240px;background:#B4310A;bottom:-120px;right:10%;}
.int-landing .cbanner .ct{position:relative;z-index:2;font-size:26px;font-weight:800;color:#fff;letter-spacing:-.02em;max-width:820px;margin:0 auto;line-height:1.28;text-shadow:0 1px 12px rgba(0,0,0,.12);}
.int-landing .cbanner .ct .u{text-decoration:underline;text-decoration-color:rgba(255,255,255,.5);text-underline-offset:4px;}
@media(max-width:600px){.int-landing .cbanner .ct{font-size:21px;}}

/* BILLING TOGGLE */
.int-landing .billing{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:34px;}
.int-landing .togrow{display:flex;align-items:center;gap:12px;}
.int-landing .togrow .lbl{font-size:14.5px;font-weight:700;color:var(--text-muted);cursor:pointer;background:none;border:none;font-family:inherit;padding:0;}
.int-landing .togrow .lbl.on{color:var(--text);}
.int-landing .switch{width:52px;height:28px;border-radius:20px;background:var(--border-strong);position:relative;cursor:pointer;transition:.2s;border:none;padding:0;}
.int-landing .switch.annual{background:var(--accent);}
.int-landing .switch .knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
.int-landing .switch.annual .knob{left:27px;}
.int-landing .freebadge{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:var(--success-bg);color:var(--success);padding:4px 9px;border-radius:12px;}
.int-landing .bnote{font-size:12.5px;color:var(--text-muted);}

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

/* CHECKOUT ERROR */
.int-landing .checkout-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:12px 20px;color:#B91C1C;font-size:14px;font-weight:500;margin-bottom:24px;}

/* FAQ */
.int-landing .faqwrap{max-width:760px;margin:0 auto;}
.int-landing .faq{border-top:1px solid var(--border);}
.int-landing .faq:last-child{border-bottom:1px solid var(--border);}
.int-landing .faq-q{width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:20px 4px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-family:inherit;}
.int-landing .faq-q .qt{font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.01em;}
.int-landing .faq-q .ic{flex:none;width:22px;height:22px;color:var(--accent);transition:transform .2s;}
.int-landing .faq.open .faq-q .ic{transform:rotate(45deg);}
.int-landing .faq-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .25s ease;}
.int-landing .faq.open .faq-a{grid-template-rows:1fr;}
.int-landing .faq-a .inner{overflow:hidden;min-height:0;}
.int-landing .faq-a .inner .pad{padding:0 4px 20px;font-size:14.5px;color:var(--text-secondary);line-height:1.6;}

/* REFER BAND */
.int-landing .referband{background:var(--accent-light);border-top:1px solid var(--border);}
.int-landing .referband-inner{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:38px 0;flex-wrap:wrap;}
.int-landing .rb-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);}
.int-landing .rb-title{font-size:25px;font-weight:800;letter-spacing:-.02em;margin-top:6px;color:var(--text);}
.int-landing .rb-sub{font-size:14.5px;color:var(--text-secondary);margin-top:8px;max-width:520px;}
.int-landing .rb-btn{flex:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700;padding:15px 26px;border-radius:10px;text-decoration:none;white-space:nowrap;transition:.15s;}
.int-landing .rb-btn:hover{background:var(--accent-dark);}

/* FOOTER */
.int-landing .footer{background:var(--ink);color:#B9C0C9;padding:52px 0 30px;}
.int-landing .foot-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:32px;}
@media(max-width:760px){.int-landing .foot-grid{grid-template-columns:1fr 1fr;gap:28px;}}
.int-landing .footer .ftag{margin-top:12px;font-size:13.5px;line-height:1.6;max-width:280px;}
.int-landing .footer .faddr{margin-top:14px;font-size:12px;color:#8A929C;line-height:1.5;}
.int-landing .footer h4{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A929C;margin-bottom:14px;}
.int-landing .footer ul{display:flex;flex-direction:column;gap:9px;}
.int-landing .footer ul a{font-size:13.5px;color:#B9C0C9;text-decoration:none;transition:.15s;}
.int-landing .footer ul a:hover{color:#fff;}
.int-landing .footer ul span.inert{font-size:13.5px;color:#6B717C;}
.int-landing .foot-bottom{margin-top:40px;padding-top:22px;border-top:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:12.5px;color:#8A929C;}
`;

function PlusIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IntegrationPricingClient({ plans }: { plans: IntegrationPlan[] }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [seatModal, setSeatModal] = useState<{ open: boolean; email: string; planName: string }>({
    open: false,
    email: "",
    planName: "",
  });
  const [activeTab, setActiveTab] = useState<"send" | "recv">("send");
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());

  function openSeatModal(email: string, planName: string) {
    setSeatModal({ open: true, email, planName });
  }

  function toggleFaq(i: number) {
    setOpenFaqs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

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
        window.location.href = `/auth/register?integrationPlanId=${encodeURIComponent(planId)}&billingPeriod=${period}`;
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
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="int-landing">
        {/* NAV */}
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/getbackplate-logo-light.svg" alt="GetBackplate" style={{ height: 28, width: "auto", display: "block" }} />
            </Link>
            <div className="navlinks">
              <Link href="/platform">Platform</Link>
              <a href="#integrations">Integration</a>
              <a href="#proof">Case study</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="nav-btns">
              <Link href="/refer" className="nav-ghost">
                Refer a vendor
              </Link>
              <a className="nav-cta" href="#pricing">
                Start sending →
              </a>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero" id="integrations">
          <div className="container">
            <div className="hero-grid">
              <div>
                <span className="badge">Integrations</span>
                <h1 className="h1">
                  Your QuickBooks® Online invoices don&apos;t land in your customers&apos; Restaurant365.{" "}
                  <span className="fix">We fixed that.</span>
                </h1>
                <p className="lead">
                  Send every invoice from QuickBooks® Online into your customers&apos; Restaurant365 —
                  automatically, no manual steps. No exports. No email chains. No re-typing.
                </p>
              </div>
              <div className="module">
                <div className="tabs">
                  <button className={`tab${activeTab === "send" ? " active" : ""}`} onClick={() => setActiveTab("send")}>
                    <div className="tt">I send invoices.</div>
                    <div className="ts">From QuickBooks® Online to Restaurant365</div>
                  </button>
                  <button className={`tab${activeTab === "recv" ? " active" : ""}`} onClick={() => setActiveTab("recv")}>
                    <div className="tt">I receive invoices.</div>
                    <div className="ts">Into my Restaurant365</div>
                  </button>
                </div>

                <div className={`panel${activeTab === "send" ? " active" : ""}`}>
                  <span className="pill">QuickBooks® Online → R365</span>
                  <div className="pline">Your restaurant clients are on R365. Your invoices should be too.</div>
                  <div className="feed">
                    <div className="feed-h">
                      <span className="dots"><i></i><i></i><i></i></span>
                      <span className="ftitle">QuickBooks® Online · Invoice sent</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">INV-1084 · Northside Grill</div><div className="im">$4,218.00 · just now</div></div>
                      <span className="stat">Sent</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">INV-1083 · Northside Grill</div><div className="im">$1,875.50 · 2 hrs ago</div></div>
                      <span className="stat">Sent</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">INV-1081 · Riverside Kitchen</div><div className="im">$3,140.00 · yesterday</div></div>
                      <span className="stat">Sent</span>
                    </div>
                  </div>
                  <div className="pcta">
                    <a className="btn primary" href="#pricing">
                      Start sending →
                    </a>
                  </div>
                </div>

                <div className={`panel${activeTab === "recv" ? " active" : ""}`}>
                  <span className="pill">R365 ← QuickBooks® Online</span>
                  <div className="pline">Get your vendors&apos; invoices into your Restaurant365 — automatically, no manual entry.</div>
                  <div className="feed">
                    <div className="feed-h">
                      <span className="dots"><i></i><i></i><i></i></span>
                      <span className="ftitle">Restaurant365 · Invoice received</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">Costa Produce Co.</div><div className="im">INV-4471 · $2,090.00</div></div>
                      <span className="stat">Received</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">Rio Grande Meats</div><div className="im">INV-8820 · $5,430.75</div></div>
                      <span className="stat">Received</span>
                    </div>
                    <div className="inv">
                      <div className="il"><div className="in">Gulf Seafood Supply</div><div className="im">INV-1902 · $1,265.40</div></div>
                      <span className="stat">Received</span>
                    </div>
                  </div>
                  <div className="refbox">
                    <div className="rt">Know a vendor who bills you?</div>
                    <div className="rd">
                      Refer them and we&apos;ll set up the integration so their invoices land in your R365
                      automatically — free for you.
                    </div>
                  </div>
                  <div className="pcta">
                    <Link href="/refer" className="btn primary">
                      Refer a vendor →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee">
          <span className="marquee-label">Built for</span>
          <div className="marquee-vp">
            <div className="marquee-track">
              {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
                <span key={i}>
                  <span className={`cat${i % 2 === 0 ? " o" : ""}`}>{item}</span>
                  <span className="sep">—</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CASE STUDY */}
        <section className="section case" id="proof">
          <div className="container">
            <div className="case-grid">
              <div>
                <span className="plive">
                  <span className="pulse"></span> In production
                </span>
                <h3>Already delivering, every day.</h3>
                <p>
                  A South Texas food distributor delivers every invoice to 24 restaurant locations
                  across 2 brands in Restaurant365 — fully automated, with no manual entry on either
                  side.
                </p>
              </div>
              <div className="metrics">
                <div className="metric"><div className="mn">24</div><div className="mk">R365 locations served</div></div>
                <div className="metric"><div className="mn">2</div><div className="mk">restaurant brands</div></div>
                <div className="metric"><div className="mn">0</div><div className="mk">manual entries</div></div>
                <div className="metric"><div className="mn">0</div><div className="mk">failed deliveries</div></div>
              </div>
            </div>
          </div>
        </section>

        {/* COLOR BANNER */}
        <div className="cbanner">
          <div className="ct">
            Works with <span className="u">QuickBooks® Online</span> and{" "}
            <span className="u">Restaurant365</span> — no manual entry, no PDFs.
          </div>
        </div>

        {/* PRICING */}
        <section className="section" id="pricing" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div className="container">
            <div className="sec-head">
              <div className="eyebrow">Pricing</div>
              <h2 className="h2">Pricing that scales with your R365 reach.</h2>
              <p className="sec-sub">
                Built for food vendors and distributors selling to Restaurant365. Send invoices and
                credit memos automatically — from QuickBooks® Online straight to your customers&apos;
                R365.
              </p>
            </div>

            <div className="billing">
              <div className="togrow">
                <button className={`lbl${!isAnnual ? " on" : ""}`} onClick={() => setIsAnnual(false)}>
                  Monthly
                </button>
                <button
                  className={`switch${isAnnual ? " annual" : ""}`}
                  aria-label="Toggle billing period"
                  onClick={() => setIsAnnual(!isAnnual)}
                >
                  <span className="knob"></span>
                </button>
                <button className={`lbl${isAnnual ? " on" : ""}`} onClick={() => setIsAnnual(true)}>
                  Annual
                </button>
                <span className="freebadge">2 months free</span>
              </div>
              <div className="bnote">Annual billing = pay 10 months, get 12. Setup fee waived.</div>
            </div>

            {checkoutError && <div className="checkout-error">{checkoutError}</div>}

            <div className="tiers">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isAnnual={isAnnual}
                  onCheckout={handleCheckout}
                  onSeatRequest={openSeatModal}
                  checkoutLoading={checkoutLoading}
                />
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" id="faq">
          <div className="container">
            <div className="sec-head">
              <div className="eyebrow">FAQ</div>
              <h2 className="h2">Questions, answered.</h2>
            </div>
            <div className="faqwrap">
              {FAQ_ITEMS.map((item, i) => (
                <div key={item.q} className={`faq${openFaqs.has(i) ? " open" : ""}`}>
                  <button className="faq-q" onClick={() => toggleFaq(i)}>
                    <span className="qt">{item.q}</span>
                    <PlusIcon />
                  </button>
                  <div className="faq-a">
                    <div className="inner">
                      <div className="pad">{item.a}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* REFER BAND */}
        <section className="referband">
          <div className="container">
            <div className="referband-inner">
              <div>
                <div className="rb-eyebrow">For restaurants</div>
                <h3 className="rb-title">Want a vendor to send you invoices this way?</h3>
                <p className="rb-sub">
                  Refer them and we&apos;ll handle the setup — their invoices land in your Restaurant365
                  automatically, at no cost to you.
                </p>
              </div>
              <Link href="/refer" className="rb-btn">
                Refer a vendor →
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="container">
            <div className="foot-grid">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/getbackplate-logo-footer.svg" alt="GetBackplate" style={{ height: 22, width: "auto" }} />
                <div className="ftag">
                  Automated invoice delivery from QuickBooks® Online into your customers&apos;
                  Restaurant365 — built for food vendors and distributors.
                </div>
                <div className="faddr">
                  1001 S. 10th St., Suite G#784
                  <br />
                  McAllen, TX 78501
                </div>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li><a href="#integrations">Integration</a></li>
                  <li><a href="#pricing">Pricing</a></li>
                  <li><a href="#proof">Case study</a></li>
                  <li><a href="#faq">FAQ</a></li>
                </ul>
              </div>
              <div>
                <h4><Link href="/legal">Legal</Link></h4>
                <ul>
                  <li><a href="/legal/integration/privacy">Privacy</a></li>
                  <li><a href="/legal/integration/terms">Terms</a></li>
                  <li><a href="/legal/integration/msa">MSA</a></li>
                  <li><a href="/legal/integration/incident-response">Incident Response</a></li>
                </ul>
              </div>
              <div>
                <h4>Company</h4>
                <ul>
                  <li><Link href="/trust">Trust Center</Link></li>
                  <li><Link href="/refer">Refer a vendor</Link></li>
                  <li><a href="mailto:hello@getbackplate.com">Contact</a></li>
                  <li><a href="https://app.getbackplate.com">Login</a></li>
                </ul>
              </div>
            </div>
            <div className="foot-bottom">
              <span>© 2026 Backplate Technologies LLC. All rights reserved.</span>
              <span>hello@getbackplate.com</span>
            </div>
            <p style={{ marginTop: 16, fontSize: 11, color: "#6B717C", textAlign: "center" }}>
              Intuit and QuickBooks® Online are registered trademarks of Intuit Inc. Used with permission.
            </p>
          </div>
        </footer>
      </div>
      <RequestSeatModal
        open={seatModal.open}
        onClose={() => setSeatModal((s) => ({ ...s, open: false }))}
        toEmail={seatModal.email}
        planName={seatModal.planName}
        source="QuickBooks® Online ↔ R365 Integration"
      />
    </>
  );
}
