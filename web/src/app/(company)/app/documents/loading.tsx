export default function DocumentsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 animate-pulse">
      <div className="mb-5 h-10 w-48 rounded-xl bg-[#f0ebe7]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[#f0ebe7]" />
        ))}
      </div>
    </main>
  );
}
