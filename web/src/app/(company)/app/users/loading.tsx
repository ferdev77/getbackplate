export default function UsersLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-[var(--gbp-surface2)]" />
            <div className="h-7 w-44 rounded bg-[var(--gbp-surface2)]" />
            <div className="h-4 w-80 rounded bg-[var(--gbp-surface2)]" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-[var(--gbp-surface2)]" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="grid grid-cols-[1fr_50px] gap-x-3 border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-3 md:grid-cols-[2fr_1.4fr_1fr_136px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px]">
          <div className="h-3 w-20 rounded bg-[var(--gbp-surface2)]" />
          <div className="hidden h-3 w-16 rounded bg-[var(--gbp-surface2)] md:block" />
          <div className="hidden h-3 w-14 rounded bg-[var(--gbp-surface2)] lg:block" />
          <div className="hidden h-3 w-12 rounded bg-[var(--gbp-surface2)] md:block" />
          <div className="h-3 w-16 rounded bg-[var(--gbp-surface2)]" />
        </div>

        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_50px] items-center gap-x-3 border-b border-[var(--gbp-border)] px-5 py-3 md:grid-cols-[2fr_1.4fr_1fr_136px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px]">
            <div className="h-4 w-36 rounded bg-[var(--gbp-surface2)]" />
            <div className="hidden h-4 w-40 rounded bg-[var(--gbp-surface2)] md:block" />
            <div className="hidden h-4 w-24 rounded bg-[var(--gbp-surface2)] lg:block" />
            <div className="hidden h-6 w-20 rounded-full bg-[var(--gbp-surface2)] md:block" />
            <div className="h-7 w-24 rounded bg-[var(--gbp-surface2)]" />
          </div>
        ))}
      </section>
    </main>
  );
}
