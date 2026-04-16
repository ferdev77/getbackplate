"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    // Ensure we have some right padding so text doesn't hide behind the icon.
    // Assuming className might use px-3 for instance. We force pr-10.
    const finalClassName = `${className} pr-10`.trim();

    return (
      <div className="relative w-full">
        <input
          {...props}
          type={showPassword ? "text" : "password"}
          className={finalClassName}
          ref={ref}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--gbp-muted)] hover:text-[var(--gbp-text)] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
