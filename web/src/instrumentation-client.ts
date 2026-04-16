// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? "0.15" : "1"));
const replaysSessionSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE ?? (isProd ? "0.02" : "0.1"));
const replaysOnErrorSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE ?? "1");
const sendDefaultPii = process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII === "true";

Sentry.init({
  dsn: "https://74f0ea8623d403c700e08452caf07962@o4511040677281792.ingest.us.sentry.io/4511040686260224",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
