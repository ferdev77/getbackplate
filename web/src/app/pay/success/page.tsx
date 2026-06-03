import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Pago confirmado — GetBackplate" };

export default function PaySuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4">
      <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-10 shadow-xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Pago confirmado</h1>
        <p className="mt-3 text-sm text-gray-500">
          Tu pago fue procesado correctamente.
        </p>
        <p className="mt-6 text-xs text-gray-400">Podés cerrar esta pestaña.</p>
      </div>
    </div>
  );
}
