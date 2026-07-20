import { z } from "zod";

export const supportRequestSchema = z.object({
  requestType: z.enum(["support", "access", "correction", "export", "deletion"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  company: z.string().trim().max(160).optional().default(""),
  details: z.string().trim().min(10).max(5000),
  website: z.string().max(200).optional().default(""),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

export function escapeSupportText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
