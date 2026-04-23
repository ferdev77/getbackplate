import { MessageSquare, CircleOff, CheckCircle2, RefreshCw, Sparkles, Bug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { PageContent } from "@/shared/ui/page-content";
import { FeedbackStatusButton } from "./feedback-status-button";

export const dynamic = "force-dynamic";

function getOrganizationName(
  organizations: { name?: string } | Array<{ name?: string }> | null | undefined,
) {
  if (!organizations) return "Empresa Borrada";
  if (Array.isArray(organizations)) return organizations[0]?.name || "Empresa Borrada";
  return organizations.name || "Empresa Borrada";
}

async function getAuthUserMap() {
  const supabase = createSupabaseAdminClient();
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) break;

    for (const user of data.users) {
      map.set(user.id, user.email ?? user.id);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return map;
}

export default async function SuperadminFeedbackPage() {
  const supabase = createSupabaseAdminClient();
  
  const { data: messages } = await supabase
    .from("feedback_messages")
    .select(`
      id,
      feedback_type,
      title,
      message,
      page_path,
      source_channel,
      created_at,
      status,
      resolved_at,
      user_id,
      organizations ( id, name, slug )
    `)
    .order("created_at", { ascending: false });

  const authUserMap = await getAuthUserMap();

  const total = messages?.length ?? 0;
  const openCount = (messages ?? []).filter(m => (!m.status || m.status === 'open') || m.status === 'read').length;
  const resolvedCount = (messages ?? []).filter(m => m.status === 'resolved').length;

  return (
    <PageContent spacing="roomy" className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="gbp-page-eyebrow mb-2 text-brand-light/60">Superadmin Control</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Feedback Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
             Bandeja de entrada centralizada. Administra los reportes de errores e ideas enviados por los usuarios de las distintas empresas.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Recibidos", val: total, icon: MessageSquare, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]" },
          { label: "Pendientes", val: openCount, icon: RefreshCw, color: "text-amber-700", bg: "bg-amber-50/50" },
          { label: "Resueltos", val: resolvedCount, icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50/50" },
        ].map((stat) => (
          <article 
            key={stat.label}
            className={`rounded-3xl border border-[var(--gbp-border)] ${stat.bg} p-5 shadow-sm`}
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" /> {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.val}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Mensajes Recientes</h2>
        </div>

        <div className="space-y-4">
          {!messages || messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line/40 py-12 text-muted-foreground">
              <CircleOff className="mb-3 h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">No hay mensajes de feedback aún.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const userEmail = authUserMap.get(msg.user_id) ?? "Usuario Desconocido";
              const typeLabel = msg.feedback_type === "bug" ? "Bug Report" : msg.feedback_type === "idea" ? "Idea / Sugerencia" : "Otro Mensaje";
              const TypeIcon = msg.feedback_type === "bug" ? Bug : msg.feedback_type === "idea" ? Sparkles : MessageSquare;
              const typeColor = msg.feedback_type === "bug" ? "text-rose-600 bg-rose-50 border-rose-100" : msg.feedback_type === "idea" ? "text-blue-600 bg-blue-50 border-blue-100" : "text-muted-foreground bg-muted/20 border-line/40";
              const sourceChannel =
                msg.source_channel === "employee"
                  ? "employee"
                  : msg.source_channel === "company"
                    ? "company"
                    : (msg.page_path?.startsWith("/portal/") ? "employee" : "company");
              const sourceLabel = sourceChannel === "employee" ? "Empleados" : "Empresa";
              const sourceColor = sourceChannel === "employee"
                ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                : "text-emerald-700 bg-emerald-50 border-emerald-200";
              const isResolved = msg.status === 'resolved';

              return (
                <article 
                  key={msg.id}
                  className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border ${isResolved ? 'border-line/40 bg-muted/10 opacity-70' : 'border-line/60 bg-white shadow-sm'} p-5 transition-all hover:border-line hover:shadow-md sm:flex-row sm:items-start`}
                >
                  <div className="flex-1 min-w-0">
                     <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] ${typeColor}`}>
                         <TypeIcon className="h-3 w-3" /> {typeLabel}
                       </span>
                       
                        <div className="flex items-center gap-1.5 rounded-full border border-line/40 bg-muted/20 px-2.5 py-0.5 text-[11px] uppercase font-semibold tracking-[0.11em] text-muted-foreground">
                           {getOrganizationName(msg.organizations as { name?: string } | Array<{ name?: string }> | null)}
                        </div>

                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] ${sourceColor}`}>
                          {sourceLabel}
                        </span>

                        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
                         por <span className="text-foreground">{userEmail}</span> • {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: es })}
                       </div>

                       {isResolved && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] text-emerald-700">
                           <CheckCircle2 className="h-3.5 w-3.5" /> Resuelto
                         </span>
                       )}
                     </div>

                     <h3 className="mb-1 text-base font-bold text-foreground">{msg.title}</h3>
                     <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl whitespace-pre-wrap">{msg.message}</p>
                  </div>

                  <div className="flex items-center gap-2 sm:self-start">
                    <FeedbackStatusButton id={msg.id} isResolved={isResolved} />
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </PageContent>
  );
}
