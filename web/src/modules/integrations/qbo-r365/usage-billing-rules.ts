export function calculateDocumentAllowance(params: {
  baseAllowance: number;
  invoiceBalance: number;
  allowanceOverride: number | null | undefined;
}): number {
  return params.allowanceOverride ?? params.baseAllowance + params.invoiceBalance;
}

export function calculateDocumentOverage(sentCount: number, allowance: number): number {
  return Math.max(0, sentCount - allowance);
}
