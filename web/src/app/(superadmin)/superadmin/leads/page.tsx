import { formatDistanceToNow } from "date-fns";
import { BriefcaseBusiness, CircleOff, Mail, Phone, Trophy, UserRoundCheck } from "lucide-react";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import { LeadEditor } from "./lead-editor";

export const dynamic = "force-dynamic";

type Lead = {
  id: string;
  source: string;
  status: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company_name: string | null;
  notes: string | null;
  created_at: string;
};

const sourceLabel: Record<string, string> = {
  seat_request: "Seat request",
  public_referral: "Public referral",
  private_referral: "Private referral",
};

export default async function SuperadminLeadsPage() {
  await requireSuperadmin();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("superadmin_leads")
    .select("id, source, status, contact_name, contact_email, contact_phone, company_name, notes, created_at")
    .order("created_at", { ascending: false });
  const leads = (data ?? []) as Lead[];

  const stats = [
    { label: "New", value: leads.filter((lead) => lead.status === "new").length, icon: BriefcaseBusiness, tone: "text-amber-700" },
    { label: "Contacted", value: leads.filter((lead) => lead.status === "contacted").length, icon: UserRoundCheck, tone: "text-blue-700" },
    { label: "Won", value: leads.filter((lead) => lead.status === "won").length, icon: Trophy, tone: "text-emerald-700" },
  ];

  return (
    <PageContent spacing="roomy" className="flex flex-col gap-6">
      <section className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-text)] p-8 text-white shadow-xl">
        <p className="gbp-page-eyebrow text-brand-light/60">Superadmin Control</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Leads</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">Track incoming seat requests and vendor referrals in one place.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em] text-[var(--gbp-text2)]"><Icon className={`h-4 w-4 ${tone}`} />{label}</p>
            <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight text-[var(--gbp-text)]">Incoming leads</h2>
          <span className="text-sm text-[var(--gbp-text2)]">{leads.length} total</span>
        </div>
        {leads.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--gbp-border)] py-12 text-[var(--gbp-text2)]">
            <CircleOff className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No leads have been received yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <article key={lead.id} className="flex flex-col gap-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--gbp-accent-glow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--gbp-accent)]">{sourceLabel[lead.source] ?? lead.source}</span>
                    <span className="rounded-full border border-[var(--gbp-border)] px-2.5 py-1 text-[11px] font-bold capitalize text-[var(--gbp-text2)]">{lead.status}</span>
                    <span className="text-xs text-[var(--gbp-text2)]">{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-[var(--gbp-text)]">{lead.company_name || lead.contact_name}</h3>
                  {lead.company_name && <p className="text-sm text-[var(--gbp-text2)]">{lead.contact_name}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--gbp-text2)]">
                    <a href={`mailto:${lead.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-[var(--gbp-accent)]"><Mail className="h-3.5 w-3.5" />{lead.contact_email}</a>
                    {lead.contact_phone && <a href={`tel:${lead.contact_phone}`} className="inline-flex items-center gap-1.5 hover:text-[var(--gbp-accent)]"><Phone className="h-3.5 w-3.5" />{lead.contact_phone}</a>}
                  </div>
                </div>
                <LeadEditor id={lead.id} initialStatus={lead.status} initialNotes={lead.notes} />
              </article>
            ))}
          </div>
        )}
      </section>
    </PageContent>
  );
}
