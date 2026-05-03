export default function IntegrationQuickbooksLoading() {
  return (
    <main className="mx-auto w-full max-w-[var(--gbp-content-max)] px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]">
      {/* Header skeleton */}
      <section className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 sm:px-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--gbp-border)]" />
        <div className="mt-2 h-7 w-72 animate-pulse rounded bg-[var(--gbp-border)]" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--gbp-border)]" />
      </section>

      {/* Stat cards skeleton */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <article
            key={i}
            className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="mt-2 h-7 w-12 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-[var(--gbp-border)]" />
          </article>
        ))}
      </section>

      {/* Connection cards skeleton */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <article
            key={i}
            className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--gbp-border)]" />
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--gbp-border)]" />
            </div>
            <div className="mt-3 h-3 w-48 animate-pulse rounded bg-[var(--gbp-border)]" />
          </article>
        ))}
      </section>

      {/* Table skeleton */}
      <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--gbp-border)] px-4 py-3">
          <div className="h-4 w-48 animate-pulse rounded bg-[var(--gbp-border)]" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-[var(--gbp-border)] px-4 py-4">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--gbp-border)]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="h-3 w-8 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="h-3 w-8 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="h-3 w-8 animate-pulse rounded bg-[var(--gbp-border)]" />
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--gbp-border)]" />
          </div>
        ))}
      </section>
    </main>
  );
}
