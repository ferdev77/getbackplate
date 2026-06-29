"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { NotificationItemRow, type NotificationListItem } from "@/shared/ui/notification-item";

type NotificationBellProps = {
  viewAllHref: string;
};

export function NotificationBell({ viewAllHref }: NotificationBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let userId: string | null = null;
    const supabase = createSupabaseBrowserClient();

    async function loadInitial() {
      const res = await fetch("/api/notifications/list?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    }

    void loadInitial();

    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;

      channelRef = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const newItem = payload.new as NotificationListItem;
            setItems((prev) => [newItem, ...prev].slice(0, 10));
            setUnreadCount((count) => count + 1);
          },
        )
        .subscribe();
    });

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function handleItemClick(item: NotificationListItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i)));
    if (!item.read_at) setUnreadCount((count) => Math.max(0, count - 1));
    setIsOpen(false);

    void fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });

    if (item.action_url) {
      router.push(item.action_url);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:text-[var(--gbp-text)]"
        aria-label="Centro de notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gbp-error)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--gbp-border)] px-4 py-3">
              <span className="text-sm font-bold text-[var(--gbp-text)]">Notificaciones</span>
              {unreadCount > 0 ? (
                <span className="text-[11px] font-semibold text-[var(--gbp-accent)]">{unreadCount} sin leer</span>
              ) : null}
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-[var(--gbp-text2)]">No tenés notificaciones todavía.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <NotificationItemRow key={item.id} item={item} onClick={handleItemClick} />
                  ))}
                </div>
              )}
            </div>

            <Link
              href={viewAllHref}
              onClick={() => setIsOpen(false)}
              className="block border-t border-[var(--gbp-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--gbp-accent)] hover:bg-[var(--gbp-surface2)]"
            >
              Ver todas
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
