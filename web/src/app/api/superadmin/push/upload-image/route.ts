import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { uploadPushImage, MAX_PUSH_IMAGE_SIZE_BYTES } from "@/infrastructure/push/push-images";

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (file.size > MAX_PUSH_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "La imagen supera el límite de 2MB" }, { status: 400 });
  }

  const result = await uploadPushImage(file);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ url: result.url });
}
