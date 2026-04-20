import { PageContent } from "@/shared/ui/page-content";

export default function DocumentsLoading() {
  return (
    <PageContent className="animate-pulse">
      <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-[var(--gbp-surface2)]" />
            <div className="h-7 w-52 rounded bg-[var(--gbp-surface2)]" />
          </div>
          <div className="h-9 w-40 rounded-lg bg-[var(--gbp-surface2)]" />
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <div className="h-3 w-24 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-3 h-8 w-14 rounded bg-[var(--gbp-surface2)]" />
          </article>
        ))}
      </section>

      <section className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
            <div className="h-5 w-44 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-2 h-4 w-64 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 rounded-full bg-[var(--gbp-surface2)]" />
              <div className="h-6 w-24 rounded-full bg-[var(--gbp-surface2)]" />
            </div>
          </article>
        ))}
      </section>
    </PageContent>
  );
}
