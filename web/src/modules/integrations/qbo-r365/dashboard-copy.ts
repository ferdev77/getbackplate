export function getInvoiceQuotaCopy(sent: number, included: number) {
  return {
    label: "Documents This Billing Cycle",
    subLabel: sent > included
      ? `${sent - included} overage · $0.99 each`
      : `${included - sent} available this billing cycle`,
  };
}
