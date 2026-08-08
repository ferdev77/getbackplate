import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertSuperadminApi } from "@/shared/lib/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "registro-desarrollo";
}

function priceState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, price]) => [key, String(price)]));
}

function renderStoredReport(html: string, prices: Record<string, string>, editable: boolean, reportId: string) {
  const serializedPrices = JSON.stringify(prices).replaceAll("<", "\\u003c");
  let rendered = html.replace(/var precios = \{[^\n]*\};/, `var precios = ${serializedPrices};`);
  const controls = `<script>(function(){
    document.querySelectorAll('.undo,.pill-paid.clickable').forEach(function(el){el.disabled=true;el.style.pointerEvents='none';});
    var clearButton=document.getElementById('btnLimpiar');if(clearButton)clearButton.hidden=true;
    ${editable ? `document.addEventListener('input',function(){setTimeout(function(){try{var value=JSON.parse(localStorage.getItem('gbp-borrador-precios-v4')||'{}');parent.postMessage({type:'development-report-prices',reportId:${JSON.stringify(reportId)},prices:value},location.origin);}catch(e){}},0);});` : `document.querySelectorAll('.bill-field input').forEach(function(el){el.disabled=true;el.style.pointerEvents='none';});`}
  })();</script>`;
  rendered = rendered.includes("</body>") ? rendered.replace("</body>", `${controls}</body>`) : `${rendered}${controls}`;
  return rendered;
}

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const access = await assertSuperadminApi();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const { reportId } = await context.params;
  if (!UUID_RE.test(reportId)) return Response.json({ error: "Informe inválido" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  if (!access.userId) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: authData } = await admin.auth.admin.getUserById(access.userId);
  const isPublisher = authData.user?.email?.trim().toLowerCase() === "fer@soliz.com";
  const { data, error } = await admin
    .from("development_ledger_reports")
    .select("title, html_document, publication_status, price_state")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data || (data.publication_status !== "published" && !isPublisher)) {
    return Response.json({ error: "Informe no encontrado" }, { status: 404 });
  }
  const disposition = `inline; filename="${safeFilename(data.title)}.html"`;
  const rendered = renderStoredReport(data.html_document, priceState(data.price_state), isPublisher && data.publication_status === "draft", reportId);
  const etag = createHash("sha256").update(rendered, "utf8").digest("hex");
  return new Response(rendered, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'self'",
      "Content-Type": "text/html; charset=utf-8",
      "ETag": `\"${etag}\"`,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
