export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#263244]" />
      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 space-y-4 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
          <div className="h-5 w-32 rounded bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
          <div className="h-4 w-full rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          <div className="h-4 w-4/5 rounded bg-gray-100 [.theme-dark-pro_&]:bg-[#1b2737]" />
          <div className="mt-2 h-10 w-28 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
        </div>
      ))}
    </div>
  );
}
