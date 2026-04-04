type GetBackplateMarkProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function GetBackplateMark({ variant = "light", className }: GetBackplateMarkProps) {
  const leftFill = variant === "dark" ? "#ffffff" : "#162a3a";

  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GetBackplate"
      role="img"
      className={className}
    >
      <path d="M18 10H8V54H18" fill="none" stroke={leftFill} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 10H56V54H46" fill="none" stroke="#d4531a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
