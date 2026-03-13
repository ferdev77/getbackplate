export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 animate-pulse">
      <div className="h-32 rounded-2xl bg-[#f0ebe7]" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-[#f0ebe7]" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 rounded-xl bg-[#f0ebe7]" />
        <div className="h-48 rounded-xl bg-[#f0ebe7]" />
      </div>
    </main>
  );
}
