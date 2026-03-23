export default function ReportsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="h-3 w-28 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="mt-2 h-7 w-52 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[#e7e0dc] bg-white p-4 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
            <div className="h-3 w-20 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="mt-3 h-8 w-14 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="h-72 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
        <article className="h-72 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
      </section>
    </main>
  );
}
