export function calculateSetupFeeCents(params: {
  setupFeeAmount: number | null | undefined;
  billingPeriod: "monthly" | "annual" | "yearly";
  annualDiscountPct?: number | null;
}): number {
  const amount = params.setupFeeAmount ?? 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const discount = Math.min(100, Math.max(0, params.annualDiscountPct ?? 25));
  const isAnnual = params.billingPeriod === "annual" || params.billingPeriod === "yearly";
  const discountedAmount = isAnnual ? amount * (1 - discount / 100) : amount;
  return Math.round(discountedAmount * 100);
}
