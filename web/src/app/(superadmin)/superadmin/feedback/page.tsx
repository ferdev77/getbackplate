import { MessageSquare, CircleOff, CheckCircle2, ChevronRight, Eye, RefreshCw, Archive, Sparkles, Bug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { updateFeedbackStatusAction } from "./actions";
import { FeedbackStatusButton } from "./feedback-status-button";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[#2d2622] bg-[#171311] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-light/60">Superadmin Control</p>
          <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Feedback Inbox</h1>
          <p className="mt-4 max-w-2xl text-base text-[#c7bbb3]/80 leading-relaxed">
             Bandeja de entrada centralizada. Administra los reportes de errores e ideas enviados por los usuarios de las distintas empresas.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Recibidos", val: total, icon: MessageSquare, color: "text-[#251f1b]", bg: "bg-white" },
          { label: "Pendientes", val: openCount, icon: RefreshCw, color: "text-amber-700", bg: "bg-amber-50/50" },
          { label: "Resueltos", val: resolvedCount, icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50/50" },
        ].map((stat, idx) => (
          <article 
            key={stat.label}
            className={`rounded-3xl border border-line/60 ${stat.bg} p-5 shadow-sm`}
          >
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" /> {stat.label}
            </p>
            <p className={`mt-2 font-serif text-3xl font-medium ${stat.color}`}>{stat.val}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-line/60 bg-white p-6 shadow-sm">
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
              const isResolved = msg.status === 'resolved';

              return (
                <article 
                  key={msg.id}
                  className={`relative flex flex-col gap-4 overflow-hidden rounded-2xl border ${isResolved ? 'border-line/40 bg-muted/10 opacity-70' : 'border-line/60 bg-white shadow-sm'} p-5 transition-all hover:border-line hover:shadow-md sm:flex-row sm:items-start`}
                >
                  <div className="flex-1 min-w-0">
                     <div className="mb-3 flex flex-wrap items-center gap-2">
                       <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-tighter ${typeColor}`}>
                         <TypeIcon className="h-3 w-3" /> {typeLabel}
                       </span>
                       
                       <div className="flex items-center gap-1.5 rounded-full border border-line/40 bg-muted/20 px-2.5 py-0.5 text-[10px] uppercase font-bold text-muted-foreground">
                          {((msg.organizations as unknown) as any)?.name ?? "Empresa Borrada"}
                       </div>

                       <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
                         por <span className="text-foreground">{userEmail}</span> • {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: es })}
                       </div>

                       {isResolved && (
                         <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                           <CheckCircle2 className="h-3.5 w-3.5" /> Resuelto
                         </span>
                       )}
                     </div>

                     <h3 className="mb-1 text-base font-bold text-foreground">{msg.title}</h3>
                     <p className="text-sm text-foreground/80 leading-relaxed max-w-4xl whitespace-pre-wrap">{msg.message}</p>
                     
                     {msg.page_path && (
                       <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                         Enviado desde: <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs">{msg.page_path}</code>
                       </p>
                     )}
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
    </main>
  );
}
