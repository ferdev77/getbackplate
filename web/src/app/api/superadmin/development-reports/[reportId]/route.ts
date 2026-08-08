import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertSuperadminApi } from "@/shared/lib/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "registro-desarrollo";
}

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const access = await assertSuperadminApi();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { reportId } = await context.params;
  if (!UUID_RE.test(reportId)) return Response.json({ error: "Informe inválido" }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("development_ledger_reports")
    .select("title, html_document, content_sha256")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Informe no encontrado" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename="${safeFilename(data.title)}.html"`;
  return new Response(data.html_document, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'self'",
      "Content-Type": "text/html; charset=utf-8",
      "ETag": `\"${data.content_sha256}\"`,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
