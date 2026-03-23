export default function DashboardLocationLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <section className="mb-4 rounded-xl border border-[#e7e0dc] bg-white px-4 py-3 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="h-3 w-28 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="mt-2 h-4 w-80 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-24 rounded-md bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="h-28 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
        ))}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="h-64 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
        <article className="h-64 rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]" />
      </section>
    </main>
  );
}
