import { NextRequest, NextResponse } from "next/server";

import { stripe } from "@/infrastructure/stripe/client";
import { assertSuperadminApi } from "@/shared/lib/access";

export async function GET(request: NextRequest) {
  const access = await assertSuperadminApi();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const priceId = request.nextUrl.searchParams.get("priceId");
  if (!priceId?.trim()) {
    return NextResponse.json({ error: "priceId requerido" }, { status: 400 });
  }

  try {
    const price = await stripe.prices.retrieve(priceId.trim());
    return NextResponse.json({
      amount: price.unit_amount ? price.unit_amount / 100 : 0,
      currency: price.currency.toUpperCase(),
      type: price.type,
      interval: price.recurring?.interval ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Price ID inválido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
