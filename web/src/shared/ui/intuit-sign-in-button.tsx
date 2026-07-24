import Image from "next/image";

export function IntuitSignInButton({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      aria-label="Sign in with Intuit"
      className={`group block h-9 w-[161px] overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077C5] ${className}`}
    >
      <Image
        src="/intuit/sign-in-with-intuit-default.svg"
        alt="Sign in with Intuit"
        width={161}
        height={36}
        unoptimized
        className="block group-hover:hidden"
      />
      <Image
        src="/intuit/sign-in-with-intuit-hover.svg"
        alt=""
        aria-hidden="true"
        width={161}
        height={36}
        unoptimized
        className="hidden group-hover:block"
      />
    </a>
  );
}
