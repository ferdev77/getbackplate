export default function AnnouncementsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <div className="mb-5 h-20 rounded-2xl bg-[#f0ebe7]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-[#f0ebe7]" />
        ))}
      </div>
    </main>
  );
}
