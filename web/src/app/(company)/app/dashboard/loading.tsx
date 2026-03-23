export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 animate-pulse">
      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="h-3 w-24 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="mt-2 h-7 w-64 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="mt-2 h-4 w-80 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="h-28 rounded-2xl border border-gray-100 bg-white p-4 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
            <div className="h-3 w-24 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="mt-4 h-8 w-16 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
            <div className="mt-3 h-3 w-28 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="h-64 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
        <article className="h-64 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
      </section>

      <section className="h-56 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
      <section className="h-56 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
    </main>
  );
}
