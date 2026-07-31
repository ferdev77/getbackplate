export type SessionCacheSnapshot<T> = {
  version: number;
  fetchedAt: number;
  data: T;
};

export type CacheMetricAction =
  | "hit"
  | "miss"
  | "write"
  | "clear"
  | "stale"
  | "invalid"
  | "read_error"
  | "write_error";

export type CacheMetricEvent = {
  key: string;
  action: CacheMetricAction;
  timestamp: string;
};

type CacheMetricsStore = {
  events: CacheMetricEvent[];
};

const METRICS_STORE_KEY = "__gbClientCacheMetrics";

declare global {
  interface Window {
    __gbClientCacheMetrics?: CacheMetricsStore;
  }
}

function getMetricsStore(): CacheMetricsStore {
  if (typeof window === "undefined") return { events: [] };
  if (!window[METRICS_STORE_KEY]) {
    window[METRICS_STORE_KEY] = { events: [] };
  }
  return window[METRICS_STORE_KEY] as CacheMetricsStore;
}

export function getClientCacheMetricsSnapshot() {
  return getMetricsStore();
}

export function clearClientCacheMetricsSnapshot() {
  const store = getMetricsStore();
  store.events = [];
}

