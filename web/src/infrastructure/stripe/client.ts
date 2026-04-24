import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

function createStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  return new Stripe(apiKey, {
    apiVersion: "2026-02-25.clover",
    appInfo: {
      name: "GetBackplate",
      version: "1.0.0",
    },
  });
}

export function getStripeClient() {
  if (!stripeSingleton) {
    stripeSingleton = createStripeClient();
  }
  return stripeSingleton;
}

// Lazy proxy so module evaluation does not require STRIPE_SECRET_KEY.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripeClient();
    return Reflect.get(client, prop, receiver);
  },
});
