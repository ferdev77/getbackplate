export default function DashboardLocationLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse px-4 py-6 sm:px-6">
      <section className="mb-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3">
        <div className="h-3 w-28 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-2 h-4 w-80 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-24 rounded-md bg-[var(--gbp-surface2)]" />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="h-28 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="h-64 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
        <article className="h-64 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]" />
      </section>
    </main>
  );
}
