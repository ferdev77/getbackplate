import { redirect } from "next/navigation";

export default async function CheckoutRedirectPage() {
  redirect("/app/dashboard?status=info&message=Use%20the%20checkout%20flow%20from%20the%20company%20dashboard");
}
