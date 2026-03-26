"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";

export async function updateFeedbackStatusAction(formData: FormData) {
  await requireSuperadmin();
  
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  
  if (!id || !status) {
    throw new Error("Missing ID or status");
  }
  
  const supabase = createSupabaseAdminClient();
  const updateData: any = { status };
  
  if (status === "resolved") {
    updateData.resolved_at = new Date().toISOString();
  } else {
    updateData.resolved_at = null;
  }

  const { error } = await supabase
    .from("feedback_messages")
    .update(updateData)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/superadmin/feedback");
}
