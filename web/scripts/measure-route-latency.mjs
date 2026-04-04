import { performance } from "node:perf_hooks";

function parseArgs(argv) {
  const args = {
    base: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    routes: ["/app/employees", "/app/documents", "/app/announcements", "/app/checklists", "/app/users", "/portal/home", "/portal/documents"],
    samples: 7,
    warmup: 1,
    cookie: process.env.PERF_COOKIE || "",
    timeoutMs: 15000,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) continue;
    if (key === "--base") args.base = value;
    if (key === "--routes") args.routes = value.split(",").map((x) => x.trim()).filter(Boolean);
    if (key === "--samples") args.samples = Number(value);
    if (key === "--warmup") args.warmup = Number(value);
    if (key === "--cookie") args.cookie = value;
    if (key === "--timeout") args.timeoutMs = Number(value);
  }

  return args;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(1));
}

async function measureOnce(url, { cookie, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: cookie ? { cookie } : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const firstByteMs = performance.now() - startedAt;
    await response.arrayBuffer();
    const totalMs = performance.now() - startedAt;

    return {
      ok: true,
      status: response.status,
      location: response.headers.get("location") || "",
      firstByteMs,
      totalMs,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      location: "",
      firstByteMs: null,
      totalMs: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const base = args.base.replace(/\/$/, "");

  console.log(`Base URL: ${base}`);
  console.log(`Routes: ${args.routes.join(", ")}`);
  console.log(`Samples per route: ${args.samples} (warmup: ${args.warmup})`);

  const rows = [];

  for (const route of args.routes) {
    const url = `${base}${route.startsWith("/") ? route : `/${route}`}`;

    for (let i = 0; i < args.warmup; i += 1) {
      await measureOnce(url, args);
    }

    const results = [];
    for (let i = 0; i < args.samples; i += 1) {
      results.push(await measureOnce(url, args));
    }

    const ok = results.filter((r) => r.ok);
    const firstBytes = ok.map((r) => r.firstByteMs).filter((n) => typeof n === "number");
    const totals = ok.map((r) => r.totalMs).filter((n) => typeof n === "number");
    const statuses = ok.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const sampleLocation = ok.find((r) => r.location)?.location || "";
    const failures = results.filter((r) => !r.ok);

    rows.push({
      route,
      ok: ok.length,
      fail: failures.length,
      status: Object.keys(statuses).length ? JSON.stringify(statuses) : "-",
      ttfb_p50_ms: percentile(firstBytes, 50),
      ttfb_p95_ms: percentile(firstBytes, 95),
      total_p50_ms: percentile(totals, 50),
      total_p95_ms: percentile(totals, 95),
      location: sampleLocation || "-",
      error: failures[0]?.error || "-",
    });
  }

  console.table(rows);
}

main().catch((error) => {
  console.error("ERROR measure-route-latency:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
