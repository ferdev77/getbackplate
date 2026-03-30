"use client";

import { useEffect, useState } from "react";
import { GetBackplateLogo } from "@/shared/ui/getbackplate-logo";

type ThemeAwareGetBackplateLogoProps = {
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
};

function isDarkThemeValue(value: string | null) {
  return value === "dark" || value === "dark-pro";
}

export function ThemeAwareGetBackplateLogo({
  width,
  height,
  className,
  priority = false,
}: ThemeAwareGetBackplateLogoProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(isDarkThemeValue(root.getAttribute("data-theme")));

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => observer.disconnect();
  }, []);

  return (
    <GetBackplateLogo
      variant={dark ? "dark" : "light"}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
