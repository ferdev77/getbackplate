"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { NotificationItemRow, type NotificationListItem } from "@/shared/ui/notification-item";

type ChannelFilter = "all" | "email" | "push";

export function NotificationsHistoryList() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function loadFirstPage() {
      setIsLoading(true);
      const res = await fetch("/api/notifications/list?limit=30", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setHasMore((data.items ?? []).length >= 30);
      }
      setIsLoading(false);
    }

    void loadFirstPage();
  }, []);

  async function loadMore() {
    if (!items.length) return;
    setIsLoadingMore(true);
    const cursor = items[items.length - 1].created_at;
    const res = await fetch(`/api/notifications/list?limit=30&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setHasMore((data.items ?? []).length >= 30);
    }
    setIsLoadingMore(false);
  }

  async function handleItemClick(item: NotificationListItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i)));
    void fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    if (item.action_url) router.push(item.action_url);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    void fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  const filteredItems = items.filter((item) => filter === "all" || item.channel === filter);
  const hasUnread = items.some((item) => !item.read_at);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["all", "email", "push"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold capitalize ${
                filter === option
                  ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                  : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"
              }`}
            >
              {option === "all" ? "Todas" : option === "email" ? "Email" : "Push"}
            </button>
          ))}
        </div>
        {hasUnread ? (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs font-semibold text-[var(--gbp-accent)] hover:underline"
          >
            Marcar todas como leídas
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-[var(--gbp-text2)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-[var(--gbp-text2)]">
          <Bell className="h-6 w-6" />
          <p className="text-sm">No hay notificaciones para mostrar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filteredItems.map((item) => (
            <NotificationItemRow key={item.id} item={item} onClick={handleItemClick} />
          ))}
        </div>
      )}

      {hasMore && !isLoading ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoadingMore}
          className="self-center rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
        >
          {isLoadingMore ? "Cargando..." : "Cargar más"}
        </button>
      ) : null}
    </div>
  );
}
