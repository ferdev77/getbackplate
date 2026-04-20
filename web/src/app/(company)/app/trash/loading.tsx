import { PageContent } from "@/shared/ui/page-content";

export default function TrashLoading() {
  return (
    <PageContent className="animate-pulse">
      {/* Header */}
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-[var(--gbp-surface2)]" />
          <div className="h-7 w-28 rounded bg-[var(--gbp-surface2)]" />
        </div>
        <div className="h-8 w-36 rounded-lg bg-[var(--gbp-surface2)]" />
      </section>

      {/* Filter / search bar */}
      <section className="mb-4 flex gap-2">
        <div className="h-9 w-64 rounded-lg bg-[var(--gbp-surface2)]" />
        <div className="h-9 w-28 rounded-lg bg-[var(--gbp-surface2)]" />
      </section>

      {/* Document rows */}
      <section className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <article
            key={i}
            className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-[var(--gbp-surface2)]" />
              <div>
                <div className="h-4 w-48 rounded bg-[var(--gbp-surface2)]" />
                <div className="mt-2 h-3 w-32 rounded bg-[var(--gbp-surface2)]" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-7 w-20 rounded-lg bg-[var(--gbp-surface2)]" />
              <div className="h-7 w-20 rounded-lg bg-[var(--gbp-surface2)]" />
            </div>
          </article>
        ))}
      </section>
    </PageContent>
  );
}
