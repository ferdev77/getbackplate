import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { completeIntuitRegistrationAction } from "@/modules/auth/intuit-sso/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";

export const metadata: Metadata = { title: "Complete registration | GetBackplate" };

export default async function CompleteIntuitRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; integrationPlanId?: string; billingPeriod?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/login?desde=integracion");
  const suggestedName = String(data.user.user_metadata?.full_name ?? "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
        <div className="mb-5 flex justify-center"><ThemeAwareGetBackplateLogo width={230} height={42} /></div>
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Intuit identity verified</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Complete your account</h1>
        <p className="mb-6 text-sm text-neutral-600">Tell us which company you are creating. QuickBooks will be connected separately after checkout.</p>
        {params.error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</div> : null}
        <form action={completeIntuitRegistrationAction} className="space-y-4">
          {params.integrationPlanId ? <input type="hidden" name="integrationPlanId" value={params.integrationPlanId} /> : null}
          {params.billingPeriod ? <input type="hidden" name="billingPeriod" value={params.billingPeriod} /> : null}
          <div>
            <label htmlFor="companyName" className="mb-1 block text-sm font-medium">Company name</label>
            <input id="companyName" name="companyName" required className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 focus:ring-2" />
          </div>
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium">Your full name</label>
            <input id="fullName" name="fullName" required defaultValue={suggestedName} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 focus:ring-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Verified email</label>
            <input value={data.user.email ?? ""} readOnly className="w-full cursor-not-allowed rounded-lg border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600" />
          </div>
          <label className="flex items-start gap-2 text-xs text-neutral-600">
            <input type="checkbox" name="legalAccepted" required className="mt-0.5" />
            <span>I agree to the <Link href="/legal/integration/terms" className="text-brand underline">Integration Terms</Link>, <Link href="/legal/integration/privacy" className="text-brand underline">Privacy Policy</Link>, and <Link href="/legal/integration/msa" className="text-brand underline">Master Services Agreement</Link>.</span>
          </label>
          <SubmitButton label="Create company" pendingLabel="Creating company..." className="w-full" />
        </form>
      </section>
    </main>
  );
}
