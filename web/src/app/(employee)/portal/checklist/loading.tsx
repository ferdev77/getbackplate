export default function PortalChecklistLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-44 rounded-xl bg-gray-200" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-gray-200" />
      ))}
    </div>
  );
}
