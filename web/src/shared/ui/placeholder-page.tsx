type PlaceholderPageProps = {
  title: string;
  subtitle: string;
};

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center px-6 py-10">
      <section className="w-full rounded-2xl border border-line bg-panel p-8">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
          Ruta base preparada
        </p>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm leading-7 text-neutral-600">{subtitle}</p>
      </section>
    </main>
  );
}
