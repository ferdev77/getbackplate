import type { ElementType, ReactNode } from "react";

type PageContentSpacing = "default" | "roomy" | "shell" | "none";

type PageContentProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  spacing?: PageContentSpacing;
};

const BASE_CLASS = "mx-auto w-full max-w-[var(--gbp-content-max)]";

const SPACING_CLASS: Record<PageContentSpacing, string> = {
  default: "px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)]",
  roomy: "px-[var(--gbp-content-pad-x-roomy)] py-[var(--gbp-content-pad-y-roomy)]",
  shell: "px-[var(--gbp-content-shell-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-shell-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]",
  none: "px-[var(--gbp-content-pad-x)] sm:px-[var(--gbp-content-pad-x-sm)]",
};

export function PageContent({
  children,
  className,
  as: Component = "main",
  spacing = "default",
}: PageContentProps) {
  const classes = [BASE_CLASS, SPACING_CLASS[spacing], className].filter(Boolean).join(" ");
  return <Component className={classes}>{children}</Component>;
}
