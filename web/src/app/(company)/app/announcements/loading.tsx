export default function AnnouncementsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
        <div className="h-10 w-36 rounded-xl bg-gray-200 [.theme-dark-pro_&]:bg-[#2a374a]" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-gray-200 [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#1b2737]" />
      ))}
    </div>
  );
}
