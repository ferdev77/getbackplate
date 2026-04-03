export default function PortalAnnouncementsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-36 rounded-xl bg-gray-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-36 rounded-2xl bg-gray-200" />
      ))}
    </div>
  );
}
