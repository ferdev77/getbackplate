"use client";

import { useEffect, useState } from "react";

import { TooltipLabel } from "@/shared/ui/tooltip";

type ThemeToggleProps = {
  className?: string;
  showLabel?: boolean;
};

const STORAGE_KEY = "gbp-theme";

function resolveDefaultDarkMode() {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
}

export function ThemeToggle({ className, showLabel = true }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (current === "dark") return true;
      if (current === "light") return false;
    }
    return resolveDefaultDarkMode();
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  function handleToggle() {
    const nextDark = !isDark;
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
    localStorage.setItem(STORAGE_KEY, nextDark ? "dark" : "light");
    setIsDark(nextDark);
  }

  return (
    <div className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
      {showLabel ? (
        <span className="w-[72px] text-right text-[10px] font-extrabold tracking-[0.1em] text-[var(--gbp-muted)] uppercase">
          {isDark ? "Night Shift" : "Day Shift"}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleToggle}
        className={[
          "group relative h-6 w-11 rounded-[var(--gbp-radius-pill)] border transition duration-200",
          isDark
            ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent)]"
            : "border-[var(--gbp-border2)] bg-[var(--gbp-surface2)]",
        ].join(" ")}
      >
        <TooltipLabel label="Cambiar tema" />
        <span
          className={[
            "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] shadow-sm transition-transform duration-200",
            isDark ? "translate-x-[20px]" : "translate-x-[2px]",
          ].join(" ")}
        >
          {isDark ? "🌙" : "☀"}
        </span>
      </button>
    </div>
  );
}
