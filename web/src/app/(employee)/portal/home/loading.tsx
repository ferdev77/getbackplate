export default function PortalHomeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero announcement */}
      <div className="h-48 rounded-2xl bg-gray-200" />
      {/* Recent announcements */}
      <div className="h-5 w-40 rounded bg-gray-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-gray-200" />
      ))}
    </div>
  );
}
