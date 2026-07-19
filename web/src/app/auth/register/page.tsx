import type { Metadata } from "next";
import Link from "next/link";
import { registerPublicAction } from "@/modules/auth/public-actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { PasswordInput } from "@/shared/ui/password-input";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";

export const metadata: Metadata = {
  title: "Create account | GetBackplate",
};

type RegisterPageProps = {
  searchParams: Promise<{ 
    error?: string; 
    priceId?: string;
    planId?: string;
    integrationPlanId?: string;
    billingPeriod?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const error = params.error;
  const planId = params.planId;
  const integrationPlanId = params.integrationPlanId;
  const billingPeriod = params.billingPeriod;
  const completeParams = new URLSearchParams();
  if (integrationPlanId) completeParams.set("integrationPlanId", integrationPlanId);
  if (billingPeriod) completeParams.set("billingPeriod", billingPeriod);
  const intuitReturnTo = `/auth/intuit/complete${completeParams.size ? `?${completeParams.toString()}` : ""}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex justify-center">
            <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
          </div>
          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
            Join GetBackplate
          </p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mb-6 text-sm text-neutral-600">
            Register your company and continue to the selected product.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {integrationPlanId ? (
            <>
              <a href={`/api/auth/intuit/start?returnTo=${encodeURIComponent(intuitReturnTo)}`} className="mb-4 flex w-full items-center justify-center rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-semibold transition hover:bg-neutral-50">
                Continue with Intuit
              </a>
              <p className="-mt-2 mb-4 text-center text-[11px] text-neutral-500">Identity only. You will connect QuickBooks after checkout.</p>
              <div className="mb-4 flex items-center gap-3 text-xs text-neutral-400"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>
            </>
          ) : null}

          <form action={registerPublicAction} className="space-y-4">
            
            {/* Hidden fields to remember what plan they were trying to buy */}
            {planId && <input type="hidden" name="planId" value={planId} />}
            {integrationPlanId && <input type="hidden" name="integrationPlanId" value={integrationPlanId} />}
            {billingPeriod && <input type="hidden" name="billingPeriod" value={billingPeriod} />}

            <div>
              <label htmlFor="companyName" className="mb-1 block text-sm font-medium">
                Company name
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="e.g. The Brothers Pizzeria"
              />
            </div>
            
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium">
                Your full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Admin email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="john@company.com"
              />
            </div>
            
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium"
              >
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                minLength={8}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="At least 8 characters"
              />
            </div>

            <SubmitButton
              label={planId || integrationPlanId ? "Create account and continue" : "Create account"}
              pendingLabel="Creating account..."
              className="w-full mt-2"
            />
          </form>

          <div className="mt-6 text-center text-sm text-neutral-600">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold text-brand hover:underline">
              Sign in here
            </Link>
          </div>
        </section>
      </SlideUp>
    </main>
  );
}
