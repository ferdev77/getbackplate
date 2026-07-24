import type { Metadata } from "next";
import { getQboReportSubscriptionFromToken } from "@/modules/integrations/qbo-r365/services/report-preferences.service";
import { PreferencesForm } from "./preferences-form";
import styles from "./preferences.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Email preferences | GetBackplate",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; unsub?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  let subscription = null;
  try {
    subscription = token ? await getQboReportSubscriptionFromToken(token) : null;
  } catch {
    subscription = null;
  }

  return (
    <main className={styles.page} lang="en">
      <div className={styles.wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/getbackplate-logo-light.svg" alt="GetBackplate" className={styles.logo} />
        <p className={styles.eyebrow}>Email preferences</p>
        <section className={styles.card}>
          {subscription ? (
            <PreferencesForm
              token={token}
              email={subscription.recipientEmail}
              currentFrequency={subscription.frequency}
              unsubscribeRequested={params.unsub === "1"}
            />
          ) : (
            <div className={styles.invalid} role="alert">
              <h1>This link is invalid</h1>
              <p>Please check the preferences link from your GetBackplate report.</p>
            </div>
          )}
        </section>
        <footer className={styles.footer}>
          Backplate Technologies LLC (&quot;GetBackplate&quot;)<br />
          1321 Upland Dr., Suite 9894, Houston, TX 77043<br />
          <a href="https://www.getbackplate.com">getbackplate.com</a>
        </footer>
      </div>
    </main>
  );
}
