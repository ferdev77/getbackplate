import type { ButtonHTMLAttributes } from "react";
import Image from "next/image";

type ConnectToQuickBooksButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function ConnectToQuickBooksButton({ className = "", disabled, ...props }: ConnectToQuickBooksButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Connect to QuickBooks"
      aria-busy={disabled || undefined}
      className={`group h-9 w-[223px] overflow-hidden rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2CA01C] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      <Image
        src="/intuit/connect-to-quickbooks-default.svg"
        alt="Connect to QuickBooks"
        width={223}
        height={36}
        unoptimized
        className="block group-hover:hidden"
      />
      <Image
        src="/intuit/connect-to-quickbooks-hover.svg"
        alt=""
        aria-hidden="true"
        width={223}
        height={36}
        unoptimized
        className="hidden group-hover:block"
      />
    </button>
  );
}
