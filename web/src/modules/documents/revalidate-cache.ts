import { revalidateTag } from "next/cache";

import { DOCUMENTS_SCOPE_USERS_TAG, DOCUMENTS_WORKSPACE_SEED_TAG } from "@/modules/documents/cached-queries";

export function revalidateDocumentsCaches() {
  revalidateTag(DOCUMENTS_WORKSPACE_SEED_TAG, "max");
  revalidateTag(DOCUMENTS_SCOPE_USERS_TAG, "max");
}
