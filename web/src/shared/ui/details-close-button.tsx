"use client";

import { X } from "lucide-react";

export function DetailsCloseButton({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        const details = e.currentTarget.closest("details");
        if (details) {
          details.removeAttribute("open");
        }
      }}
      className={className || "rounded-full bg-muted/40 p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"}
    >
      {children || <X className="h-5 w-5" />}
    </button>
  );
}
