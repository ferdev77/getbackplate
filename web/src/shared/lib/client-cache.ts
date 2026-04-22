export type SessionCacheSnapshot<T> = {
  version: number;
  fetchedAt: number;
  data: T;
};

type CacheMetricAction =
  | "hit"
  | "miss"
  | "write"
  | "clear"
  | "stale"
  | "invalid"
  | "read_error"
  | "write_error";

function emitCacheMetric(key: string, action: CacheMetricAction) {
  if (typeof window === "undefined") return;
  const detail = {
    key,
    action,
    timestamp: new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent("gb:client-cache-metric", { detail }));
  if (process.env.NODE_ENV === "development") {
    console.debug("[client-cache]", detail);
  }
}

export function readSessionCacheSnapshot<T>(input: {
  key: string;
  version: number;
  ttlMs: number;
}): SessionCacheSnapshot<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(input.key);
    if (!raw) {
      emitCacheMetric(input.key, "miss");
      return null;
    }

    const parsed = JSON.parse(raw) as SessionCacheSnapshot<T>;
    if (!parsed || parsed.version !== input.version || typeof parsed.fetchedAt !== "number") {
      window.sessionStorage.removeItem(input.key);
      emitCacheMetric(input.key, "invalid");
      return null;
    }

    if (Date.now() - parsed.fetchedAt > input.ttlMs) {
      window.sessionStorage.removeItem(input.key);
      emitCacheMetric(input.key, "stale");
      return null;
    }

    emitCacheMetric(input.key, "hit");
    return parsed;
  } catch {
    emitCacheMetric(input.key, "read_error");
    return null;
  }
}

export function writeSessionCacheSnapshot<T>(input: {
  key: string;
  snapshot: SessionCacheSnapshot<T>;
}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(input.key, JSON.stringify(input.snapshot));
    emitCacheMetric(input.key, "write");
  } catch {
    emitCacheMetric(input.key, "write_error");
  }
}

export function clearSessionCacheSnapshot(key: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
  emitCacheMetric(key, "clear");
}
