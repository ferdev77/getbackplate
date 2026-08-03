import { describe, expect, it } from "vitest";

import { processAnnouncementRecurrenceJob } from "../announcement-recurrence.service";

type Operation = { table: string; type: string; data?: unknown };

function fakeSupabase(announcement: { publish_at: string | null; expires_at: string | null } | null) {
  const operations: Operation[] = [];
  const client = {
    from(table: string) {
      let type = "select";
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: (data: unknown) => {
          type = "insert";
          operations.push({ table, type, data });
          return Promise.resolve({ error: null });
        },
        delete: () => {
          type = "delete";
          operations.push({ table, type });
          return chain;
        },
        eq: () => chain,
        maybeSingle: async () => ({ data: announcement, error: null }),
        then(resolve: (value: unknown) => void) {
          return resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
  return { client: client as never, operations };
}

const JOB = {
  id: "job-1",
  organization_id: "org-1",
  target_id: "av-1",
  metadata: { channels: ["email", "push"] },
};

describe("recurrencia de avisos", () => {
  it("limpia un job huerfano sin encolar", async () => {
    const fake = fakeSupabase(null);

    const result = await processAnnouncementRecurrenceJob({
      supabase: fake.client,
      job: JOB,
      now: new Date("2026-08-02T12:00:00Z"),
      nextRun: new Date("2026-08-03T12:00:00Z"),
    });

    expect(result).toMatchObject({ queued: false, removed: true, reason: "missing" });
    expect(fake.operations).toContainEqual({ table: "scheduled_jobs", type: "delete" });
  });

  it("no encola cuando vence exactamente al comenzar el job", async () => {
    const fake = fakeSupabase({ publish_at: null, expires_at: "2026-08-02T12:00:00Z" });

    const result = await processAnnouncementRecurrenceJob({
      supabase: fake.client,
      job: JOB,
      now: new Date("2026-08-02T12:00:00Z"),
      nextRun: new Date("2026-08-03T12:00:00Z"),
    });

    expect(result.reason).toBe("expired");
    expect(fake.operations.some((operation) => operation.table === "announcement_deliveries")).toBe(false);
  });

  it("conserva un aviso aun no publicado pero no lo encola", async () => {
    const fake = fakeSupabase({ publish_at: "2026-08-03T12:00:00Z", expires_at: null });

    const result = await processAnnouncementRecurrenceJob({
      supabase: fake.client,
      job: JOB,
      now: new Date("2026-08-02T12:00:00Z"),
      nextRun: new Date("2026-08-03T12:00:00Z"),
    });

    expect(result).toMatchObject({ queued: false, removed: false, reason: "unpublished" });
    expect(fake.operations).toEqual([]);
  });

  it("encola los canales guardados y elimina el job despues de la ultima vuelta valida", async () => {
    const fake = fakeSupabase({ publish_at: "2026-08-01T12:00:00Z", expires_at: "2026-08-03T12:00:00Z" });

    const result = await processAnnouncementRecurrenceJob({
      supabase: fake.client,
      job: JOB,
      now: new Date("2026-08-02T12:00:00Z"),
      nextRun: new Date("2026-08-03T12:00:00Z"),
    });

    expect(result).toMatchObject({ queued: true, removed: true, reason: "last_run" });
    expect(fake.operations.find((operation) => operation.table === "announcement_deliveries")?.data).toEqual([
      { organization_id: "org-1", announcement_id: "av-1", channel: "email", status: "queued" },
      { organization_id: "org-1", announcement_id: "av-1", channel: "push", status: "queued" },
    ]);
    expect(fake.operations).toContainEqual({ table: "scheduled_jobs", type: "delete" });
  });

  it("encola una vuelta activa y conserva el job si hay otra antes de vencer", async () => {
    const fake = fakeSupabase({ publish_at: null, expires_at: "2026-08-10T12:00:00Z" });

    const result = await processAnnouncementRecurrenceJob({
      supabase: fake.client,
      job: JOB,
      now: new Date("2026-08-02T12:00:00Z"),
      nextRun: new Date("2026-08-03T12:00:00Z"),
    });

    expect(result).toMatchObject({ queued: true, removed: false, reason: "queued" });
    expect(fake.operations.some((operation) => operation.table === "scheduled_jobs")).toBe(false);
  });
});
