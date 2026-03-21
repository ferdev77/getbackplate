export default function ChecklistsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
        <div className="h-10 w-36 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
      </div>
      {/* List rows */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
        <div className="h-12 border-b border-gray-100 bg-gray-50 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#111824]" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex h-14 items-center gap-4 border-b border-gray-50 px-4 [.theme-dark-pro_&]:border-[#263244]">
            <div className="h-4 w-56 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
            <div className="ml-auto h-4 w-20 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
            <div className="h-4 w-24 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          </div>
        ))}
      </div>
    </div>
  );
}
