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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#dccfca] bg-[#fffdfa] px-6 py-12 text-center [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723]">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[#f5f0ed] text-[#a09088] [.theme-dark-pro_&]:bg-[#1c2536] [.theme-dark-pro_&]:text-[#6b7f9a]">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-[#5a504a] [.theme-dark-pro_&]:text-[#c8d7ea]">
        {title}
      </p>
      {description ? (
        <p className="max-w-xs text-xs text-[#8b817c] [.theme-dark-pro_&]:text-[#7d8fa6]">
          {description}
        </p>
      ) : null}
      {action ?? null}
    </div>
  );
}
