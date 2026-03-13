export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 animate-pulse">
      <div className="mb-6 h-10 w-40 rounded-xl bg-[#f0ebe7]" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="mb-4 h-24 rounded-2xl bg-[#f0ebe7]" />
      ))}
    </main>
  );
}
