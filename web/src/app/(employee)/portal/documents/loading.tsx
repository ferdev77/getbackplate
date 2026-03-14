export default function PortalDocumentsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-44 rounded-xl bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
