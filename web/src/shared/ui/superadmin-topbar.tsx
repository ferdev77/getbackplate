"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { logoutAction } from "@/modules/auth/actions";

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-8">
        <Link href="/superadmin/dashboard" className="flex items-center gap-2 group mr-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-lg shadow-brand/20 transition-transform group-hover:scale-105">
            <span className="text-lg font-bold italic">S</span>
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-foreground sm:block">Superadmin</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-2 text-sm font-medium transition-all rounded-xl ${
                  active
                    ? "text-brand bg-brand/5 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.label}
                {active && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 z-[-1] rounded-xl bg-brand/5 border border-brand/10"
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
          className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted-foreground transition-colors hover:text-foreground md:hidden"
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
            className="absolute top-full left-0 z-50 w-full border-b border-line bg-panel p-6 shadow-2xl md:hidden"
          >
            <div className="flex flex-col gap-2">
              {ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3.5 transition-all ${
                      active 
                        ? "bg-brand/5 text-brand font-bold" 
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span className="text-[15px]">{item.label}</span>
                    {active && <ChevronRight className="h-4 w-4" />}
                  </Link>
                );
              })}

              <div className="mt-4 pt-4 border-t border-line">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3.5 text-[15px] font-bold text-red-600 transition-colors hover:bg-red-100"
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
