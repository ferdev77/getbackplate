"use client";

import { useEffect, useMemo, useState } from "react";

type CacheMetricAction =
  | "hit"
  | "miss"
  | "write"
  | "clear"
  | "stale"
  | "invalid"
  | "read_error"
  | "write_error";

type CacheMetricEvent = {
  key: string;
  action: CacheMetricAction;
  timestamp: string;
};

const MAX_EVENTS = 40;

export function DevClientCachePanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CacheMetricEvent[]>([]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<CacheMetricEvent>;
      const detail = custom.detail;
      if (!detail || typeof detail.key !== "string" || typeof detail.action !== "string") return;

      setEvents((prev) => [{
        key: detail.key,
        action: detail.action,
        timestamp: detail.timestamp,
      }, ...prev].slice(0, MAX_EVENTS));
    };

    window.addEventListener("gb:client-cache-metric", handler as EventListener);
    return () => window.removeEventListener("gb:client-cache-metric", handler as EventListener);
  }, []);

  const summary = useMemo(() => {
    const counters: Record<CacheMetricAction, number> = {
      hit: 0,
      miss: 0,
      write: 0,
      clear: 0,
      stale: 0,
      invalid: 0,
      read_error: 0,
      write_error: 0,
    };

    for (const item of events) {
      counters[item.action] += 1;
    }

    const totalLookups = counters.hit + counters.miss + counters.stale + counters.invalid + counters.read_error;
    const hitRate = totalLookups > 0 ? Math.round((counters.hit / totalLookups) * 100) : 0;

    return { counters, hitRate, total: events.length };
  }, [events]);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="fixed bottom-4 left-4 z-[100]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-lg backdrop-blur"
        >
          <span>Cache Dev</span>
          <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px]">{summary.hitRate}% hit</span>
        </button>
      ) : (
        <div className="w-[360px] max-w-[90vw] rounded-xl border border-emerald-400/25 bg-[#0b1a17]/95 p-3 text-xs text-emerald-100 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Client Cache Metrics</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEvents([])}
                className="rounded border border-emerald-400/30 px-2 py-1 text-[10px] hover:bg-emerald-400/15"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-emerald-400/30 px-2 py-1 text-[10px] hover:bg-emerald-400/15"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-3 gap-2 text-[10px]">
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Hit: {summary.counters.hit}</div>
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Miss: {summary.counters.miss}</div>
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Hit Rate: {summary.hitRate}%</div>
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Write: {summary.counters.write}</div>
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Clear: {summary.counters.clear}</div>
            <div className="rounded border border-emerald-400/20 bg-black/20 p-2">Stale/Invalid: {summary.counters.stale + summary.counters.invalid}</div>
          </div>

          <div className="max-h-[260px] overflow-auto rounded border border-emerald-400/15">
            <table className="w-full border-collapse text-[10px]">
              <thead className="sticky top-0 bg-[#102620]">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Hora</th>
                  <th className="px-2 py-1 text-left font-semibold">Accion</th>
                  <th className="px-2 py-1 text-left font-semibold">Key</th>
                </tr>
              </thead>
              <tbody>
                {events.map((item, index) => (
                  <tr key={`${item.timestamp}-${index}`} className="border-t border-emerald-400/10">
                    <td className="px-2 py-1 text-emerald-200/80">{new Date(item.timestamp).toLocaleTimeString()}</td>
                    <td className="px-2 py-1 font-semibold">{item.action}</td>
                    <td className="px-2 py-1 text-emerald-200/80">{item.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-emerald-200/70">Solo visible en desarrollo (`NODE_ENV=development`).</p>
        </div>
      )}
    </div>
  );
}
