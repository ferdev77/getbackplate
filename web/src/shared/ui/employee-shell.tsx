"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type EmployeeShellProps = {
  organizationName: string;
  children: React.ReactNode;
  employeeName: string;
  employeePosition: string | null;
  branchName: string | null;
  departmentName: string | null;
  docsCount: number;
  checklistTemplateNames: string[];
  enabledModules: {
    documents: boolean;
    checklists: boolean;
    announcements: boolean;
    onboarding: boolean;
  };
};

function initials(value: string) {
  const tokens = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!tokens.length) return "EM";
  return tokens.map((item) => item[0]?.toUpperCase() ?? "").join("");
}

export function EmployeeShell({
  organizationName,
  children,
  employeeName,
  employeePosition,
  branchName,
  departmentName,
  docsCount,
  checklistTemplateNames,
  enabledModules,
}: EmployeeShellProps) {
  const pathname = usePathname();
  const hasChecklistTab = enabledModules.checklists;
  const hasDocumentsTab = enabledModules.documents;
  const hasOnboardingTab = enabledModules.onboarding;
  const checklistTabLabel = hasChecklistTab && checklistTemplateNames.length > 0
    ? `✅ Checklist (${checklistTemplateNames.length})`
    : "✅ Checklist";

  const activeTab = pathname.startsWith("/portal/documents")
    ? "documents"
    : pathname.startsWith("/portal/checklist")
      ? "checklist"
    : pathname.startsWith("/portal/onboarding")
      ? "instructions"
      : "home";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4f0] text-[#1a1a1a]">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-[#111] px-4 sm:px-10">
        <p className="text-lg font-bold tracking-[0.01em] text-white">{organizationName}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1 pl-1 pr-3">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#c0392b] text-[11px] font-bold text-white">{initials(employeeName)}</div>
            <span className="text-sm text-[#d6d6d6]">{employeeName}</span>
          </div>
          <a href="/auth/logout" className="text-xs text-[#6d6d6d] hover:text-white">Salir -&gt;</a>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8e8e8] bg-white px-4 py-6 sm:px-10 sm:py-7">
        <div>
          <p className="text-xs text-[#aaa]">Bienvenido de vuelta</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-[#111]">{employeeName}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {branchName ? <span className="rounded-full border border-[#e8e8e8] bg-[#f5f5f5] px-2.5 py-1 text-[#888]">{branchName}</span> : null}
            {departmentName ? <span className="rounded-full border border-[#dbe7ff] bg-[#f2f6ff] px-2.5 py-1 text-[#3b5bdb]">{departmentName}</span> : null}
            {employeePosition ? <span className="rounded-full border border-[#f0d5d0] bg-[#fef0ed] px-2.5 py-1 text-[#c0392b]">{employeePosition}</span> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="font-serif text-5xl font-bold leading-none text-[#c0392b]">{docsCount}</p>
          <p className="mt-1 text-xs text-[#aaa]">documentos disponibles</p>
        </div>
      </section>

      <nav className="flex border-b-[1.5px] border-[#e8e8e8] bg-white px-2 sm:px-10">
        <Link href="/portal/home" className={`border-b-[2.5px] px-4 py-3 text-[13px] font-semibold ${activeTab === "home" ? "border-[#c0392b] text-[#c0392b]" : "border-transparent text-[#999] hover:text-[#555]"}`}>🏠 Inicio</Link>
        {hasChecklistTab ? <Link href="/portal/checklist" className={`border-b-[2.5px] px-4 py-3 text-[13px] font-semibold ${activeTab === "checklist" ? "border-[#c0392b] text-[#c0392b]" : "border-transparent text-[#999] hover:text-[#555]"}`}>{checklistTabLabel}</Link> : null}
        {hasDocumentsTab ? <Link href="/portal/documents" className={`border-b-[2.5px] px-4 py-3 text-[13px] font-semibold ${activeTab === "documents" ? "border-[#c0392b] text-[#c0392b]" : "border-transparent text-[#999] hover:text-[#555]"}`}>📁 Mis Documentos</Link> : null}
        {hasOnboardingTab ? <Link href="/portal/onboarding" className={`border-b-[2.5px] px-4 py-3 text-[13px] font-semibold ${activeTab === "instructions" ? "border-[#c0392b] text-[#c0392b]" : "border-transparent text-[#999] hover:text-[#555]"}`}>📋 Instrucciones</Link> : null}
      </nav>

      <div className="mx-auto w-full max-w-[900px] flex-1 px-4 py-9 sm:px-10">{children}</div>

      <footer className="mt-auto flex items-center justify-between bg-[#111] px-4 py-5 sm:px-10">
        <p className="text-sm text-[#777]">{organizationName}</p>
        <p className="text-[11px] text-[#444]">© 2026 {organizationName} - Powered by GetBackplate</p>
      </footer>
    </div>
  );
}
