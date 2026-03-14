export default function EmployeesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-xl bg-gray-200" />
        <div className="h-10 w-36 rounded-xl bg-gray-200" />
      </div>
      {/* Tab bar */}
      <div className="flex gap-2">
        <div className="h-9 w-28 rounded-lg bg-gray-200" />
        <div className="h-9 w-28 rounded-lg bg-gray-100" />
      </div>
      {/* Table rows */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="h-12 bg-gray-50 border-b border-gray-100" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center px-4 h-14 border-b border-gray-50">
            <div className="h-8 w-8 rounded-full bg-gray-200" />
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-100 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
