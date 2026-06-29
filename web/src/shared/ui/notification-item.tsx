"use client";

import { Mail, Bell } from "lucide-react";

export type NotificationListItem = {
  id: string;
  channel: "email" | "push";
  title: string;
  body: string;
  action_url: string | null;
  source: string;
  created_at: string;
  read_at: string | null;
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `Hace ${diffD} d`;
  return new Date(iso).toLocaleDateString("es-US", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function NotificationChannelBadge({ channel }: { channel: "email" | "push" }) {
  if (channel === "email") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border2)] bg-[color-mix(in_oklab,blue_10%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
        <Mail className="h-3 w-3" /> Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-accent-glow)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gbp-accent)]">
      <Bell className="h-3 w-3" /> Push
    </span>
  );
}

export function NotificationItemRow({
  item,
  onClick,
}: {
  item: NotificationListItem;
  onClick: (item: NotificationListItem) => void;
}) {
  const isUnread = !item.read_at;

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className={`flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
        isUnread ? "bg-[var(--gbp-accent-glow)]" : "hover:bg-[var(--gbp-surface2)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <NotificationChannelBadge channel={item.channel} />
          {isUnread ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" /> : null}
        </div>
        <span className="shrink-0 text-[11px] text-[var(--gbp-text2)]">{formatRelativeTime(item.created_at)}</span>
      </div>
      <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{item.title}</p>
      <p className="line-clamp-2 text-xs text-[var(--gbp-text2)]">{item.body}</p>
    </button>
  );
}
