export default function DocumentsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
        <div className="h-10 w-36 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
      </div>
      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-gray-200 [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#1b2737]" />
        ))}
      </div>
    </div>
  );
}
