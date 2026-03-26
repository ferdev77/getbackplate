export default function UsersLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 animate-pulse">
      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="h-7 w-44 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
            <div className="h-4 w-80 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="grid grid-cols-[1fr_50px] md:grid-cols-[2fr_1.4fr_1fr_136px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px] gap-x-3 border-b border-gray-100 bg-gray-50 px-5 py-3 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#111824]">
          <div className="h-3 w-20 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
          <div className="hidden md:block h-3 w-16 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
          <div className="hidden lg:block h-3 w-14 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
          <div className="hidden md:block h-3 w-12 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
          <div className="h-3 w-16 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        </div>

        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_50px] md:grid-cols-[2fr_1.4fr_1fr_136px] lg:grid-cols-[minmax(190px,2fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_minmax(100px,.8fr)_136px] items-center gap-x-3 border-b border-gray-50 px-5 py-3 [.theme-dark-pro_&]:border-[#263244]">
            <div className="h-4 w-36 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
            <div className="hidden md:block h-4 w-40 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            <div className="hidden lg:block h-4 w-24 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            <div className="hidden md:block h-6 w-20 rounded-full bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            <div className="h-7 w-24 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          </div>
        ))}
      </section>
    </main>
  );
}
