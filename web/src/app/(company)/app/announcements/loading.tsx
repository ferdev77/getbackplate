export default function AnnouncementsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-44 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="h-8 w-36 rounded-lg bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[#e7e0dc] bg-white p-4 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
            <div className="h-3 w-24 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="mt-3 h-8 w-14 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
          </article>
        ))}
      </section>

      <section className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <article key={i} className="rounded-xl border border-[#e8e8e8] bg-white px-5 py-4 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
            <div className="h-5 w-52 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="mt-2 h-4 w-80 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 rounded-full bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
              <div className="h-6 w-24 rounded-full bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
              <div className="h-6 w-16 rounded-full bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
