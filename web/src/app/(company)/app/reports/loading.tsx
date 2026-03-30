export default function ReportsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="h-3 w-28 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-2 h-7 w-52 rounded bg-[var(--gbp-surface2)]" />
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <div className="h-3 w-20 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-3 h-8 w-14 rounded bg-[var(--gbp-surface2)]" />
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="h-72 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
        <article className="h-72 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
      </section>
    </main>
  );
}
