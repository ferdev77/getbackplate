// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? "0.15" : "1"));
const sendDefaultPii = process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII === "true";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ? undefined : "https://74f0ea8623d403c700e08452caf07962@o4511040677281792.ingest.us.sentry.io/4511040686260224",

  // Session Replay is intentionally not enabled: this app renders QuickBooks
  // invoice data (amounts, customer names) and Intuit's App Store review
  // requires QuickBooks data never leaves the app to third parties.

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
