"use client";

import { type LucideIcon, Inbox } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--gbp-surface2)] text-[var(--gbp-muted)]">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-[var(--gbp-text)]">
        {title}
      </p>
      {description ? (
        <p className="max-w-xs text-xs text-[var(--gbp-text2)]">
          {description}
        </p>
      ) : null}
      {action ?? null}
    </div>
  );
}
