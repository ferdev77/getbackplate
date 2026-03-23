export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="h-3 w-24 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="mt-2 h-7 w-48 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
      </section>

      <section className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <article key={i} className="rounded-2xl border border-gray-100 bg-white p-6 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
            <div className="h-5 w-40 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="h-10 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
              <div className="h-10 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            </div>
            <div className="mt-4 h-9 w-32 rounded-lg bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
          </article>
        ))}
      </section>
    </main>
  );
}
