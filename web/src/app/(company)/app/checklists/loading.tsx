export default function ChecklistsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <div className="mb-5 h-28 rounded-2xl bg-[#f0ebe7]" />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[#f0ebe7]" />
        ))}
      </div>
      <div className="h-12 rounded-xl bg-[#f0ebe7] mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="mb-2 h-12 rounded-xl bg-[#f0ebe7]" />
      ))}
    </main>
  );
}
