"use client";

import { EditableBranchItem } from "./editable-branch-item";
import { createTranslator } from "./settings.i18n";

interface Branch {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
}

interface BranchListProps {
  locale?: "es" | "en";
  initialBranches: Branch[];
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
}

export function BranchList({
  locale,
  initialBranches,
  updateAction,
  deleteAction,
  toggleStatusAction,
}: BranchListProps) {
  const t = createTranslator(locale);
  if (!initialBranches?.length) {
    return <p className="text-center py-8 rounded-xl border border-dashed border-[var(--gbp-border2)] text-sm text-[var(--gbp-text2)]">{t("Aún no hay locaciones.")}</p>;
  }

  return (
    <div className="space-y-3">
      {initialBranches.map((branch) => (
        <div key={branch.id} className="relative list-none">
          <EditableBranchItem
            locale={locale}
            branch={branch}
            updateAction={updateAction}
            deleteAction={deleteAction}
            toggleStatusAction={toggleStatusAction}
          />
        </div>
      ))}
    </div>
  );
}
