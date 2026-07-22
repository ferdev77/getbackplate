import { NextRequest, NextResponse } from "next/server";
import {
  getQboReportSubscriptionFromToken,
  isQboReportFrequency,
  updateQboReportPreference,
} from "@/modules/integrations/qbo-r365/services/report-preferences.service";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: unknown; frequency?: unknown };
    if (typeof body.token !== "string" || !isQboReportFrequency(body.frequency)) {
      return NextResponse.json(
        { error: "This preferences link is invalid" },
        { status: 400, headers: RESPONSE_HEADERS },
      );
    }

    const subscription = await getQboReportSubscriptionFromToken(body.token);
    const updated = await updateQboReportPreference({
      subscriptionId: subscription.id,
      frequency: body.frequency,
      source: "public_link",
      expectedTokenNonce: subscription.tokenNonce,
    });

    return NextResponse.json(
      { ok: true, frequency: updated.frequency },
      { headers: RESPONSE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: "This preferences link is invalid" },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }
}
