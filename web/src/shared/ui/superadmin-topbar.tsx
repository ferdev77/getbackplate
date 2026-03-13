"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/superadmin/dashboard", label: "Superadmin" },
  { href: "/superadmin/organizations", label: "Organizaciones" },
  { href: "/superadmin/modules", label: "Modulos" },
  { href: "/superadmin/plans", label: "Planes" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SuperadminTopbar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 text-sm">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-xl border border-[#f0d5d0] bg-[#fff5f3] px-3 py-1.5 font-semibold text-[#b63a2f] transition hover:border-[#d97d72] hover:bg-[#ffe9e5] hover:text-[#8f2e26]"
                : "rounded-xl px-3 py-1.5 text-[#6f6560] transition hover:bg-[#f8f1ee] hover:text-[#2f2925]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
