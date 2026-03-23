import { redirect } from "next/navigation";

export default async function CheckoutRedirectPage() {
  redirect("/app/dashboard?status=info&message=Usa%20el%20flujo%20de%20checkout%20del%20panel%20empresa");
}
