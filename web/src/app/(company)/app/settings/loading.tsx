export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl animate-pulse px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="h-3 w-24 rounded bg-[var(--gbp-surface2)]" />
        <div className="mt-2 h-7 w-48 rounded bg-[var(--gbp-surface2)]" />
      </section>

      <section className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6">
            <div className="h-5 w-40 rounded bg-[var(--gbp-surface2)]" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="h-10 rounded bg-[var(--gbp-surface2)]" />
              <div className="h-10 rounded bg-[var(--gbp-surface2)]" />
            </div>
            <div className="mt-4 h-9 w-32 rounded-lg bg-[var(--gbp-surface2)]" />
          </article>
        ))}
      </section>
    </main>
  );
}
