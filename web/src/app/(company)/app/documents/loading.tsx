export default function DocumentsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-gray-200" />
        <div className="h-10 w-36 rounded-xl bg-gray-200" />
      </div>
      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
