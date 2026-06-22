export function resolveHistoryCustomerName(item: { customerName: string | null }): string {
  return item.customerName ?? "-";
}
