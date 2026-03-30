export default function AnnouncementsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse px-4 py-6 sm:px-6">
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-44 rounded bg-[var(--gbp-surface2)]" />
        <div className="h-8 w-36 rounded-lg bg-[var(--gbp-surface2)]" />
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
        {Array.from({ length: 5 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
            <div className="h-5 w-52 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-2 h-4 w-80 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 rounded-full bg-[var(--gbp-surface2)]" />
              <div className="h-6 w-24 rounded-full bg-[var(--gbp-surface2)]" />
              <div className="h-6 w-16 rounded-full bg-[var(--gbp-surface2)]" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
