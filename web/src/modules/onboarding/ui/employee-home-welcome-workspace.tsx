"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const EmployeeWelcomeModal = dynamic(
  () => import("@/modules/onboarding/ui/employee-welcome-modal").then((mod) => mod.EmployeeWelcomeModal),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/55 p-4">
        <div className="w-full max-w-[420px] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)]">
          <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Bienvenido</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--gbp-text2)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Cargando formulario...</span>
          </div>
        </div>
      </div>
    ),
  },
);

type EmployeeHomeWelcomeWorkspaceProps = {
  open: boolean;
  pendingDocs: number;
  approvedDocs: number;
  contractSigned: boolean;
  finishAction: (formData: FormData) => void;
};

export function EmployeeHomeWelcomeWorkspace({
  open,
  pendingDocs,
  approvedDocs,
  contractSigned,
  finishAction,
}: EmployeeHomeWelcomeWorkspaceProps) {
  useEffect(() => {
    if (!open) return;
    void import("@/modules/onboarding/ui/employee-welcome-modal");
  }, [open]);

  if (!open) return null;

  return (
    <EmployeeWelcomeModal
      pendingDocs={pendingDocs}
      approvedDocs={approvedDocs}
      contractSigned={contractSigned}
      finishAction={finishAction}
    />
  );
}
