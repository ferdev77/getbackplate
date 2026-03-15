import { User } from "@supabase/supabase-js";

/**
 * Extracts a robust display name from a Supabase User object,
 * prioritizing full_name or name from metadata, falling back to email, then "Administrador".
 */
export function extractDisplayName(user: User | null | undefined): string {
  if (!user) return "Administrador";

  const full = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  if (full) return full;

  const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  if (name) return name;

  return user.email || "Administrador";
}
