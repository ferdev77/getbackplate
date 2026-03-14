export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 rounded-xl bg-gray-200" />
      {/* Settings sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 space-y-4">
          <div className="h-5 w-32 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-4/5 rounded bg-gray-100" />
          <div className="h-10 w-28 rounded-xl bg-gray-200 mt-2" />
        </div>
      ))}
    </div>
  );
}
