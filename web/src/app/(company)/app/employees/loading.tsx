export default function EmployeesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 animate-pulse">
      <div className="h-28 rounded-2xl bg-[#f0ebe7]" />
      <div className="h-12 rounded-xl bg-[#f0ebe7]" />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-[#f0ebe7]" />
      ))}
    </main>
  );
}
