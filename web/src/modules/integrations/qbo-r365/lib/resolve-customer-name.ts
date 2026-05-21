/**
 * Resolves the display customer name for a row in the unified invoice history.
 *
 * SYNC invoices migrated via backfill stored the R365 vendor name (e.g. "PRODEL DISTRIBUTION INC")
 * as customer_name instead of the actual QBO customer. For those rows, the sync config's
 * qboCustomerName is the source of truth.
 *
 * Webhook and manual invoices already store CustomerRef.name directly, so customer_name is used as-is.
 */
export function resolveHistoryCustomerName(
  item: { importSource: string; syncConfigId: string | null; customerName: string | null },
  syncConfigs: Array<{ id: string; qboCustomerName: string }>,
): string {
  if (item.importSource === "sync" && item.syncConfigId) {
    return (
      syncConfigs.find((c) => c.id === item.syncConfigId)?.qboCustomerName ??
      item.customerName ??
      "-"
    );
  }
  return item.customerName ?? "-";
}
