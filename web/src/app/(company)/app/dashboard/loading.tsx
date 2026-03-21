export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-56 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200 [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#1b2737]" />
        ))}
      </div>
      {/* Main content blocks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-gray-200 [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#1b2737]" />
        <div className="h-64 rounded-2xl bg-gray-200 [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#1b2737]" />
      </div>
    </div>
  );
}
