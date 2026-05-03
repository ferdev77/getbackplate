/**
 * Detects when a Supabase query fails because a column doesn't exist yet.
 * Used as a fallback pattern during schema migrations where a new column
 * (e.g. sort_order) may not exist in older DB versions.
 */
export function hasMissingColumnError(
  error: { message?: string } | null,
  column: string,
): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("column") && message.includes(column.toLowerCase());
}
