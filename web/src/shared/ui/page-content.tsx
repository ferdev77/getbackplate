import type { ElementType, ReactNode } from "react";

type PageContentSpacing = "default" | "roomy" | "shell" | "none";

type PageContentProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  spacing?: PageContentSpacing;
};

const BASE_CLASS = "mx-auto w-full max-w-[var(--gbp-content-max)]";

const HORIZONTAL_CLASS = "px-[var(--gbp-content-pad-x)] sm:px-[var(--gbp-content-pad-x-sm)]";

const SPACING_CLASS: Record<PageContentSpacing, string> = {
  default: `${HORIZONTAL_CLASS} py-[var(--gbp-content-pad-y)]`,
  roomy: `${HORIZONTAL_CLASS} py-[var(--gbp-content-pad-y-roomy)]`,
  shell: `${HORIZONTAL_CLASS} py-[var(--gbp-content-shell-pad-y)] sm:py-[var(--gbp-content-shell-pad-y-sm)]`,
  none: HORIZONTAL_CLASS,
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
