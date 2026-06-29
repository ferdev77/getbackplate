"use client";

import { useState, useMemo, useRef } from "react";
import { Bell, Mail, Search, CheckSquare, Square, Send, Loader2, AlertCircle, CheckCircle2, Users, ImagePlus, X, History, Smartphone, CalendarClock, Zap, Ban, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PageContent } from "@/shared/ui/page-content";
import { IntegrationAlertsCard } from "./integration-alerts-card";

import type { Subscriber } from "./page";

type Channel = "push" | "email";
type Org = { id: string; name: string };
type LogRow = {
  id: string;
  created_at: string;
  created_by: string;
  channels: Channel[];
  title: string;
  body: string;
  image_url: string | null;
  target_type?: "orgs" | "users";
  org_ids: string[];
  user_ids?: string[];
  push_sent: number;
  push_expired: number;
  push_failed: number;
  email_sent: number;
  email_failed: number;
};
type ScheduledRow = {
  id: string;
  created_at: string;
  created_by: string;
  channels: Channel[];
  title: string;
  body: string;
  image_url: string | null;
  target_type?: "orgs" | "users";
  target_all: boolean;
  org_ids: string[];
  user_ids?: string[];
  scheduled_at: string;
  status: string;
};
type Props = { orgs: Org[]; logs: LogRow[]; subscribers: Subscriber[]; scheduled: ScheduledRow[]; integrationAlertsEnabled: boolean };

function todayLocalDateInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildHourOptions(dateInput: string) {
  const isToday = dateInput === todayLocalDateInput();
  const minHour = isToday ? new Date().getHours() + 1 : 0;
  const hours: string[] = [];
  for (let h = minHour; h < 24; h++) hours.push(String(h).padStart(2, "0"));
  return hours;
}

function parseUserAgent(ua: string | null) {
  if (!ua) return "—";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Otro";
}

function parseBrowser(ua: string | null) {
  if (!ua) return "—";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "—";
}

function userDisplayName(s: Subscriber) {
  return s.first_name || s.last_name ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : null;
}

function ChannelsBadges({ channels }: { channels: Channel[] }) {
  return (
    <div className="flex gap-1">
      {channels.includes("push") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gbp-accent-glow)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--gbp-accent)]">
          <Bell className="h-3 w-3" /> Push
        </span>
      ) : null}
      {channels.includes("email") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
          <Mail className="h-3 w-3" /> Email
        </span>
      ) : null}
    </div>
  );
}

export function NotificationBroadcastClient({ orgs, logs: initialLogs, subscribers, scheduled: initialScheduled, integrationAlertsEnabled }: Props) {
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["push"]));
  const [audienceMode, setAudienceMode] = useState<"orgs" | "users">("orgs");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{ targetType: "orgs" | "users"; targetCount: number; pushSent: number; pushExpired: number; pushFailed: number; emailSent: number; emailFailed: number } | null>(null);
  const [logs, setLogs] = useState<LogRow[]>(initialLogs);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState(todayLocalDateInput());
  const [scheduleHour, setScheduleHour] = useState("");
  const [scheduled, setScheduled] = useState<ScheduledRow[]>(initialScheduled);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hourOptions = useMemo(() => buildHourOptions(scheduleDate), [scheduleDate]);

  const filtered = useMemo(
    () => orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
    [orgs, search],
  );

  const uniqueUsers = useMemo(() => {
    const byUser = new Map<string, Subscriber>();
    for (const s of subscribers) {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, s);
    }
    return Array.from(byUser.values());
  }, [subscribers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    if (!q) return uniqueUsers;
    return uniqueUsers.filter((u) => {
      const name = (userDisplayName(u) ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const org = u.org_name.toLowerCase();
      return name.includes(q) || email.includes(q) || org.includes(q);
    });
  }, [uniqueUsers, userSearch]);

  function toggleChannel(channel: Channel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  function toggleOrg(id: string) {
    setAllSelected(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setAllSelected(false);
      setSelectedIds(new Set());
    } else {
      setAllSelected(true);
      setSelectedIds(new Set());
    }
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen (JPEG, PNG o WebP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2MB");
      return;
    }

    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/superadmin/push/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al subir imagen");
      setImageUrl(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir imagen");
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage() {
    setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const targetCount = audienceMode === "users" ? selectedUserIds.size : allSelected ? orgs.length : selectedIds.size;
  const targetLabel = audienceMode === "users" ? "usuario" : "org";
  const hasMessage = title.trim().length > 0 && body.trim().length > 0;
  const canSend =
    targetCount > 0 &&
    hasMessage &&
    channels.size > 0 &&
    !isPending &&
    !imageUploading &&
    (sendMode === "now" || scheduleHour !== "");

  function scheduleDateToIso(): string | null {
    if (!scheduleHour) return null;
    const local = new Date(`${scheduleDate}T${scheduleHour}:00:00`);
    if (Number.isNaN(local.getTime()) || local.getTime() <= Date.now()) return null;
    return local.toISOString();
  }

  async function handleSend() {
    if (!canSend) return;
    const scheduledAtIso = sendMode === "schedule" ? scheduleDateToIso() : null;
    if (sendMode === "schedule" && !scheduledAtIso) {
      toast.error("Elegí una fecha y hora futura");
      return;
    }

    setIsPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/superadmin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          channels: Array.from(channels),
          ...(audienceMode === "users"
            ? { userIds: Array.from(selectedUserIds) }
            : { orgIds: allSelected ? "all" : Array.from(selectedIds) }),
          ...(imageUrl ? { image: imageUrl } : {}),
          ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Error al enviar");

      if (data.scheduled) {
        toast.success(`Envío programado para ${new Date(data.scheduledAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`);
        setScheduled((prev) => [
          ...prev,
          {
            id: data.id,
            created_at: new Date().toISOString(),
            created_by: "yo",
            channels: Array.from(channels),
            title: title.trim(),
            body: body.trim(),
            image_url: imageUrl,
            target_type: audienceMode,
            target_all: audienceMode === "orgs" && allSelected,
            org_ids: audienceMode === "orgs" ? (allSelected ? [] : Array.from(selectedIds)) : [],
            user_ids: audienceMode === "users" ? Array.from(selectedUserIds) : [],
            scheduled_at: data.scheduledAt,
            status: "pending",
          },
        ].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
        setTitle("");
        setBody("");
        setImageUrl(null);
        setScheduleHour("");
        return;
      }

      setResult(data);
      toast.success(`Notificación enviada a ${data.targetCount} ${data.targetType === "users" ? "usuario" : "org"}${data.targetCount !== 1 ? "s" : ""}`);
      setLogs((prev) => [
        {
          id: `optimistic-${Date.now()}`,
          created_at: new Date().toISOString(),
          created_by: "yo",
          channels: Array.from(channels),
          title: title.trim(),
          body: body.trim(),
          image_url: imageUrl,
          target_type: audienceMode,
          org_ids: audienceMode === "orgs" ? (allSelected ? [] : Array.from(selectedIds)) : [],
          user_ids: audienceMode === "users" ? Array.from(selectedUserIds) : [],
          push_sent: data.pushSent,
          push_expired: data.pushExpired,
          push_failed: data.pushFailed,
          email_sent: data.emailSent,
          email_failed: data.emailFailed,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setIsPending(false);
    }
  }

  async function handleCancelScheduled(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/superadmin/notifications/scheduled/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Error al cancelar");
      setScheduled((prev) => prev.filter((s) => s.id !== id));
      toast.success("Envío programado cancelado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cancelar");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <PageContent spacing="roomy" className="flex flex-col gap-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-2xl">
        <div className="pointer-events-none absolute -right-14 -top-16 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,.35)_0%,transparent_70%)] opacity-50" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-brand/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-light ring-1 ring-brand/30">Superadmin</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight text-white">
            <Bell className="h-6 w-6" /> Centro de Notificaciones
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Envía push y/o email directamente a una o varias organizaciones, o a usuarios puntuales.
          </p>
        </div>
      </section>

      <IntegrationAlertsCard initialEnabled={integrationAlertsEnabled} />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Audience selector */}
        <article className="overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
          <div className="border-b border-[var(--gbp-border)] px-6 py-5">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudienceMode("orgs")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  audienceMode === "orgs"
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Organizaciones
              </button>
              <button
                type="button"
                onClick={() => setAudienceMode("users")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  audienceMode === "users"
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" /> Usuarios específicos
              </button>
            </div>

            {audienceMode === "orgs" ? (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-[var(--gbp-text)]">Seleccionar organizaciones</h2>
                  <p className="text-xs text-[var(--gbp-text2)] mt-0.5">{targetCount} de {orgs.length} seleccionadas</p>
                </div>
                <button
                  type="button"
                  onClick={toggleAll}
                  className={`inline-flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2 text-xs font-bold transition-all ${
                    allSelected
                      ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                      : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {allSelected ? "Deseleccionar todas" : "Todas las organizaciones"}
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--gbp-text)]">Seleccionar usuarios</h2>
                <p className="text-xs text-[var(--gbp-text2)] mt-0.5">
                  {targetCount} de {uniqueUsers.length} seleccionados · solo usuarios con push activo
                </p>
              </div>
            )}
          </div>

          {audienceMode === "orgs" ? (
            <>
              <div className="px-6 pt-4 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-muted)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar organización..."
                    className="w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] py-2 pl-9 pr-3 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto px-4 pb-4">
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--gbp-muted)]">Sin resultados</p>
                ) : (
                  <div className="flex flex-col gap-1 pt-2">
                    {filtered.map((org) => {
                      const checked = allSelected || selectedIds.has(org.id);
                      return (
                        <button
                          key={org.id}
                          type="button"
                          onClick={() => toggleOrg(org.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-all ${
                            checked
                              ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]"
                              : "border-transparent hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-bg)]"
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-[var(--gbp-muted)]" />
                          )}
                          <span className={`text-sm font-medium ${checked ? "text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}>
                            {org.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="px-6 pt-4 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-muted)]" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nombre, email u organización..."
                    className="w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] py-2 pl-9 pr-3 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto px-4 pb-4">
                {filteredUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--gbp-muted)]">
                    {uniqueUsers.length === 0 ? "Ningún usuario tiene push activo aún." : "Sin resultados"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 pt-2">
                    {filteredUsers.map((u) => {
                      const checked = selectedUserIds.has(u.user_id);
                      const name = userDisplayName(u);
                      return (
                        <button
                          key={u.user_id}
                          type="button"
                          onClick={() => toggleUser(u.user_id)}
                          className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-all ${
                            checked
                              ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]"
                              : "border-transparent hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-bg)]"
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-[var(--gbp-muted)]" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium ${checked ? "text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}>
                              {name ?? <span className="italic text-[var(--gbp-muted)]">Sin nombre</span>}
                            </span>
                            <span className="block truncate text-xs text-[var(--gbp-text2)]">
                              {u.email ?? "—"} · {u.org_name}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </article>

        {/* Form + result */}
        <div className="flex flex-col gap-4">
          <article className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold tracking-tight text-[var(--gbp-text)]">Mensaje</h2>

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Canales</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleChannel("push")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  channels.has("push")
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <Bell className="h-3.5 w-3.5" /> Push
              </button>
              <button
                type="button"
                onClick={() => toggleChannel("email")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  channels.has("email")
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSendMode("now")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  sendMode === "now"
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <Zap className="h-3.5 w-3.5" /> Enviar ahora
              </button>
              <button
                type="button"
                onClick={() => setSendMode("schedule")}
                className={`flex items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-xs font-bold transition-all ${
                  sendMode === "schedule"
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" /> Programar
              </button>
            </div>

            {sendMode === "schedule" && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Fecha</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    min={todayLocalDateInput()}
                    onChange={(e) => { setScheduleDate(e.target.value); setScheduleHour(""); }}
                    className="w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] focus:border-[var(--gbp-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Hora</label>
                  <select
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(e.target.value)}
                    className="w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] focus:border-[var(--gbp-accent)] focus:outline-none"
                  >
                    <option value="">Elegir...</option>
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
                {hourOptions.length === 0 && (
                  <p className="col-span-2 text-[11px] text-amber-600">No quedan horas disponibles hoy — elegí otra fecha.</p>
                )}
              </div>
            )}

            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="ej. Actualización importante"
              className="w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--gbp-muted)]">{title.length}/100</p>

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Cuerpo</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Escribe el contenido de la notificación..."
              className="w-full resize-y rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--gbp-muted)]">{body.length}/500</p>

            {/* Image upload */}
            <div className="mt-4">
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                Imagen <span className="normal-case font-normal text-[var(--gbp-muted)]">(opcional — solo push, Chrome/Edge)</span>
              </label>

              {imageUrl ? (
                <div className="relative overflow-hidden rounded-xl border-[1.5px] border-[var(--gbp-border2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Preview" className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageUploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-5 text-sm text-[var(--gbp-text2)] transition-all hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                >
                  {imageUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo...</>
                  ) : (
                    <><ImagePlus className="h-4 w-4" /> Agregar imagen (máx. 2MB)</>
                  )}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageChange}
              />
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-5 py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {sendMode === "schedule" ? "Programando..." : "Enviando..."}</>
              ) : sendMode === "schedule" ? (
                <><CalendarClock className="h-4 w-4" /> Programar para {targetCount} {targetLabel}{targetCount !== 1 ? "s" : ""}</>
              ) : (
                <><Send className="h-4 w-4" /> Enviar a {targetCount} {targetLabel}{targetCount !== 1 ? "s" : ""}</>
              )}
            </button>
          </article>

          {result && (
            <article className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-[var(--gbp-text)]">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Resultado del envío
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: result.targetType === "users" ? "Usuarios" : "Organizaciones", val: result.targetCount, color: "text-[var(--gbp-text)]" },
                  { label: "Push enviados", val: result.pushSent, color: "text-emerald-600" },
                  { label: "Push vencidos", val: result.pushExpired, color: "text-amber-600" },
                  { label: "Push con error", val: result.pushFailed, color: "text-red-600" },
                  { label: "Emails enviados", val: result.emailSent, color: "text-emerald-600" },
                  { label: "Emails con error", val: result.emailFailed, color: "text-red-600" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">{item.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${item.color}`}>{item.val}</p>
                  </div>
                ))}
              </div>
              {result.pushSent === 0 && result.emailSent === 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  No se enviaron notificaciones. Los destinatarios elegidos pueden no tener push activo ni email conocido.
                </div>
              )}
            </article>
          )}

          {scheduled.length > 0 && (
            <article className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-[var(--gbp-text)]">
                <CalendarClock className="h-4 w-4 text-[var(--gbp-accent)]" /> Programados
                <span className="ml-auto rounded-full bg-[var(--gbp-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gbp-text2)]">
                  {scheduled.length}
                </span>
              </h2>
              <div className="flex flex-col gap-2">
                {scheduled.map((s) => {
                  const audienceLabel =
                    s.target_type === "users"
                      ? `${(s.user_ids ?? []).length} usuario${(s.user_ids ?? []).length !== 1 ? "s" : ""}`
                      : s.target_all
                        ? "Todas las orgs"
                        : `${s.org_ids.length} org${s.org_ids.length !== 1 ? "s" : ""}`;
                  return (
                    <div key={s.id} className="flex items-start gap-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1"><ChannelsBadges channels={s.channels} /></div>
                        <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{s.title}</p>
                        <p className="truncate text-xs text-[var(--gbp-muted)]">{s.body}</p>
                        <p className="mt-1 text-[11px] font-medium text-[var(--gbp-accent)]">
                          {new Date(s.scheduled_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {audienceLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelScheduled(s.id)}
                        disabled={cancellingId === s.id}
                        className="flex shrink-0 items-center gap-1 rounded-lg border-[1.5px] border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        {cancellingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        Cancelar
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          )}
        </div>
      </div>

      {/* Subscribers */}
      <article className="overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[var(--gbp-border)] px-6 py-5">
          <Smartphone className="h-4 w-4 text-[var(--gbp-text2)]" />
          <h2 className="text-sm font-bold tracking-tight text-[var(--gbp-text)]">Usuarios con push activo</h2>
          <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
            {subscribers.length}
          </span>
        </div>

        {subscribers.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--gbp-muted)]">Ningún usuario tiene push activo aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--gbp-border)] text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                  <th className="px-6 py-3">Organización</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Dispositivo</th>
                  <th className="px-4 py-3">Browser</th>
                  <th className="px-4 py-3 whitespace-nowrap">Suscripto desde</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub, i) => (
                  <tr
                    key={`${sub.org_id}:${sub.user_id}:${i}`}
                    className="border-b border-[var(--gbp-border)] transition-colors hover:bg-[var(--gbp-bg)]"
                  >
                    <td className="px-6 py-3 font-medium text-[var(--gbp-text)]">{sub.org_name}</td>
                    <td className="px-4 py-3 text-[var(--gbp-text)]">
                      {sub.first_name || sub.last_name
                        ? `${sub.first_name ?? ""} ${sub.last_name ?? ""}`.trim()
                        : <span className="text-[var(--gbp-muted)] text-xs italic">Sin nombre</span>
                      }
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-[var(--gbp-text2)]">
                      {sub.email ?? <span className="text-[var(--gbp-muted)] italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{parseUserAgent(sub.user_agent)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{parseBrowser(sub.user_agent)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--gbp-text2)]">
                      {new Date(sub.created_at).toLocaleDateString("es-US", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* History */}
      <article className="overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
        <div className="flex items-center gap-2 border-b border-[var(--gbp-border)] px-6 py-5">
          <History className="h-4 w-4 text-[var(--gbp-text2)]" />
          <h2 className="text-sm font-bold tracking-tight text-[var(--gbp-text)]">Historial de envíos</h2>
          <span className="ml-auto rounded-full bg-[var(--gbp-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gbp-text2)]">
            {logs.length}
          </span>
        </div>

        {logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--gbp-muted)]">Aún no hay envíos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--gbp-border)] text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-4 py-3">Enviado por</th>
                  <th className="px-4 py-3">Canales</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3 text-right text-emerald-700">Push OK</th>
                  <th className="px-4 py-3 text-right text-amber-700">Push vencidos</th>
                  <th className="px-4 py-3 text-right text-emerald-700">Email OK</th>
                  <th className="px-4 py-3 text-right text-red-700">Errores</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-[var(--gbp-border)] transition-colors hover:bg-[var(--gbp-bg)] ${i % 2 === 0 ? "" : "bg-[var(--gbp-surface-alt,var(--gbp-bg))]"}`}
                  >
                    <td className="whitespace-nowrap px-6 py-3 text-xs text-[var(--gbp-text2)]">
                      {new Date(log.created_at).toLocaleString("es-US", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-xs text-[var(--gbp-text2)]">{log.created_by}</td>
                    <td className="px-4 py-3"><ChannelsBadges channels={log.channels} /></td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="truncate font-medium text-[var(--gbp-text)]">{log.title}</p>
                      <p className="truncate text-xs text-[var(--gbp-muted)]">{log.body}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{log.push_sent}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-600">{log.push_expired}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{log.email_sent}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{log.push_failed + log.email_failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </PageContent>
  );
}
