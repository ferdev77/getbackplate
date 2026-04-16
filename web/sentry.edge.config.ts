// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? "0.15" : "1"));
const sendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII === "true";

Sentry.init({
  dsn: "https://74f0ea8623d403c700e08452caf07962@o4511040677281792.ingest.us.sentry.io/4511040686260224",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii,
});
