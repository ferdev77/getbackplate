"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X, LogOut, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { logoutAction } from "@/modules/auth/actions";
import { GetBackplateLogo } from "@/shared/ui/getbackplate-logo";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";

const ITEMS = [
  { href: "/superadmin/dashboard", label: "Dashboard" },
  { href: "/superadmin/organizations", label: "Organizaciones" },
  { href: "/superadmin/feedback", label: "Feedback" },
  { href: "/superadmin/modules", label: "Módulos" },
  { href: "/superadmin/plans", label: "Planes" },
  { href: "/superadmin/trash", label: "Papelera" },
  { href: "/superadmin/guide", label: "Guía" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SuperadminTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const item of ITEMS) {
        if (pathname.startsWith(item.href)) continue;
        if (prefetchedRoutesRef.current.has(item.href)) continue;
        prefetchedRoutesRef.current.add(item.href);
        router.prefetch(item.href);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [pathname, router]);

  return (
    <>
      <div className="flex items-center gap-8">
        <Link href="/superadmin/dashboard" className="flex items-center gap-2 group mr-2">
          <GetBackplateLogo variant="light" width={170} height={30} className={`${BRAND_SCALE.superadminTopbarHeight} w-auto`} priority />
          <span className="hidden rounded-full border border-[var(--gbp-accent)]/35 bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--gbp-accent)] sm:block">Superadmin</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => router.prefetch(item.href)}
                className={`relative px-4 py-2 text-sm font-medium transition-all rounded-xl ${
                  active
                     ? "text-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] font-bold"
                     : "text-[var(--gbp-text2)] hover:text-[var(--gbp-text)] hover:bg-[var(--gbp-surface2)]"
                }`}
              >
                {item.label}
                {active && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 z-[-1] rounded-xl bg-[var(--gbp-accent-glow)] border border-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)]"
                    transition={{ type: "spring", duration: 0.5 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:text-[var(--gbp-text)] md:hidden"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Desktop Logout - only visible if needed, but the layout usually has it */}
        {/* We'll keep the layout's logout button for desktop and only add it to mobile menu here */}
      </div>

      {/* Mobile Navigation Interface - Dropdown Style */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-full left-0 z-50 w-full border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-2xl md:hidden"
          >
            <div className="flex flex-col gap-2">
              {ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    onMouseEnter={() => router.prefetch(item.href)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3.5 transition-all ${
                      active 
                        ? "bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] font-bold" 
                        : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
                    }`}
                  >
                    <span className="text-[15px]">{item.label}</span>
                    {active && <ChevronRight className="h-4 w-4" />}
                  </Link>
                );
              })}

              <div className="mt-4 pt-4 border-t border-[var(--gbp-border)]">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl bg-[var(--gbp-error-soft)] px-4 py-3.5 text-[15px] font-bold text-[var(--gbp-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)]"
                  >
                    <LogOut className="h-5 w-5" />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
