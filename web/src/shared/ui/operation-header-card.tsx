import type { ReactNode } from "react";

type OperationHeaderCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function OperationHeaderCard({
  eyebrow,
  title,
  description,
  action,
  className = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]",
  eyebrowClassName = "text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--gbp-text2)]",
  titleClassName = "mt-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]",
  descriptionClassName = "mt-1 text-sm text-[var(--gbp-text2)]",
}: OperationHeaderCardProps) {
  return (
    <section className={`mb-5 rounded-2xl border p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={eyebrowClassName}>{eyebrow}</p>
          <h1 className={titleClassName}>{title}</h1>
          <p className={descriptionClassName}>{description}</p>
        </div>
        {action}
      </div>
    </section>
  );
}
