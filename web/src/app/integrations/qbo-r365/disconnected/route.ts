import { after, NextResponse } from "next/server";
import {
  processPendingQboDisconnects,
  queueQboPortalDisconnect,
} from "@/modules/integrations/qbo-r365/service";
import { getRequestOrigin } from "@/shared/lib/app-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const realmId = url.searchParams.get("realmId")?.trim() ?? "";
  let queued = false;

  if (/^\d{1,32}$/.test(realmId)) {
    try {
      queued = await queueQboPortalDisconnect(realmId);
    } catch {
      console.error("[qbo-disconnect] Unable to persist Intuit disconnect redirect");
    }
  }

  if (queued) {
    after(async () => {
      await processPendingQboDisconnects(5).catch(() => undefined);
    });
  }

  const response = NextResponse.redirect(
    new URL("/integrations/qbo-r365/disconnected/complete", getRequestOrigin(request)),
    { status: 303 },
  );
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
