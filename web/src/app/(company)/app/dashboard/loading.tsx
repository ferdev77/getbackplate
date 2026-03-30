export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="h-3 w-24 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-2 h-7 w-64 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-2 h-4 w-80 rounded bg-[var(--gbp-surface2)]" />
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="h-28 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <div className="h-3 w-24 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-4 h-8 w-16 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-3 h-3 w-28 rounded bg-[var(--gbp-surface2)]" />
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="h-64 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
        <article className="h-64 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
      </section>

      <section className="h-56 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
      <section className="h-56 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
    </main>
  );
}
