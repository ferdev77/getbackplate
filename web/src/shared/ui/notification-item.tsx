"use client";

import { Mail, Bell, Smartphone } from "lucide-react";
import { createTranslator } from "./company-shell.i18n";

type Locale = "es" | "en";

export type NotificationListItem = {
  id: string;
  channel: "email" | "push" | "in_app";
  title: string;
  body: string;
  action_url: string | null;
  source: string;
  created_at: string;
  read_at: string | null;
};

function formatRelativeTime(iso: string, locale: Locale): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return locale === "en" ? "Now" : "Ahora";
  if (diffMin < 60) return locale === "en" ? `${diffMin} min ago` : `Hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return locale === "en" ? `${diffH} h ago` : `Hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return locale === "en" ? `${diffD} d ago` : `Hace ${diffD} d`;
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function NotificationChannelBadge({ channel, locale = "es" }: { channel: "email" | "push" | "in_app"; locale?: Locale }) {
  const t = createTranslator(locale);
  if (channel === "email") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border2)] bg-[color-mix(in_oklab,blue_10%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
        <Mail className="h-3 w-3" /> Email
      </span>
    );
  }
  if (channel === "in_app") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gbp-text2)]">
        <Smartphone className="h-3 w-3" /> {t("En la app")}
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
  locale = "es",
}: {
  item: NotificationListItem;
  onClick: (item: NotificationListItem) => void;
  locale?: Locale;
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
          <NotificationChannelBadge channel={item.channel} locale={locale} />
          {isUnread ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" /> : null}
        </div>
        <span className="shrink-0 text-[11px] text-[var(--gbp-text2)]">{formatRelativeTime(item.created_at, locale)}</span>
      </div>
      <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{item.title}</p>
      <p className="line-clamp-2 text-xs text-[var(--gbp-text2)]">{item.body}</p>
    </button>
  );
}
