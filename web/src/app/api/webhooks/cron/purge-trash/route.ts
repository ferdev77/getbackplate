import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

const BUCKET_NAME = "tenant-documents";
const RETENTION_DAYS_SUPERADMIN = 30;

// This endpoint is meant to be called by Vercel Cron
export async function GET(request: Request) {
  // Validate authorization header for cron job security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdminClient();

  try {
    // We get the list of ALL soft-deleted documents before purging 
    // to also be able to remove their physical files safely
    
    // Purge logic: 
    // We purge everything older than RETENTION_DAYS_SUPERADMIN (30 days) unconditionally,
    // AND we could purge items older than 15 days if we want to enforce Company limits 
    // strictly, but the requirement is "15d empresa / 30d superadmin". 
    // Meaning the company can't see it after 15 days, but superadmin can see it up to 30 days.
    // Wait, the rule says "sistema papelera con retención de 15 días para clientes empresa y 30 dias en superadmin"
    // So the actual PURGE should only happen after 30 days!
    // At 15 days, it just hides from the company UI. But currently, the company UI shows ALL deleted_at.
    // Let me revise that. For now, the physical purge only needs to happen after 30 days globally.

    const purgeThreshold = new Date();
    purgeThreshold.setDate(purgeThreshold.getDate() - RETENTION_DAYS_SUPERADMIN);

    const { data: documentsToPurge, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("id, file_path")
      .not("deleted_at", "is", null)
      .lte("deleted_at", purgeThreshold.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    if (!documentsToPurge || documentsToPurge.length === 0) {
      return NextResponse.json({ ok: true, purged: 0, message: "No documents to purge" });
    }

    // 1. Delete physical files from bucket
    const filePaths = documentsToPurge
      .map(doc => doc.file_path)
      .filter(path => Boolean(path)) as string[];

    if (filePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove(filePaths);
      
      if (storageError) {
        console.error("Storage purge error:", storageError);
        // Continue to delete DB records even if storage fails?
        // Let's assume bucket files can be orphaned if strictly necessary, 
        // but ideally we log this.
      }
    }

    // 2. Delete database records
    const idsToPurge = documentsToPurge.map(doc => doc.id);
    const { error: dbError } = await supabaseAdmin
      .from("documents")
      .delete()
      .in("id", idsToPurge);

    if (dbError) {
      throw dbError;
    }

    return NextResponse.json({ ok: true, purged: idsToPurge.length });

  } catch (err: unknown) {
    console.error("Cron Purge Action Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
