export default function ChecklistsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 rounded-xl bg-gray-200" />
        <div className="h-10 w-36 rounded-xl bg-gray-200" />
      </div>
      {/* List rows */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="h-12 bg-gray-50 border-b border-gray-100" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center px-4 h-14 border-b border-gray-50">
            <div className="h-4 w-56 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-100 ml-auto" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
