export function formatIntegrationRenewalReminder(amountDue: number, currency: string, periodEnd: number) {
  return {
    amount: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountDue / 100),
    renewalDate: new Date(periodEnd * 1000).toLocaleDateString("en-US"),
  };
}
