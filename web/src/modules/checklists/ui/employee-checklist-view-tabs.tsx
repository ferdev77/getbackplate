"use client";

type Props = {
  viewMode: "assigned" | "created";
  onChange: (next: "assigned" | "created") => void;
};

export function EmployeeChecklistViewTabs({ viewMode, onChange }: Props) {
  return (
    <section className="mb-4 inline-flex items-center rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-1">
      <button
        type="button"
        onClick={() => onChange("assigned")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "assigned" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}
      >
        Asignados a mi
      </button>
      <button
        type="button"
        onClick={() => onChange("created")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "created" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}
      >
        Creados por mi
      </button>
    </section>
  );
}
