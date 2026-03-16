import Stripe from "stripe";

// Initialize the Stripe singleton instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-02-25.clover" as any, // Using as any to avoid strict union breaks if versions mismatch across dependencies
  appInfo: {
    name: "GetBackplate",
    version: "1.0.0",
  },
});
