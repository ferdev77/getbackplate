import Image from "next/image";

type GetBackplateLogoProps = {
  variant?: "light" | "dark" | "footer";
  className?: string;
  width?: number;
  height?: number;
  alt?: string;
  priority?: boolean;
};

const SRC_BY_VARIANT = {
  light: "/getbackplate-logo-light.svg",
  dark: "/getbackplate-logo-dark.svg",
  footer: "/getbackplate-logo-footer.svg",
} as const;

export function GetBackplateLogo({
  variant = "light",
  className,
  width = 190,
  height = 34,
  alt = "GetBackplate",
  priority = false,
}: GetBackplateLogoProps) {
  return (
    <Image
      src={SRC_BY_VARIANT[variant]}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
