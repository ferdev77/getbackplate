type GetBackplateMarkProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function GetBackplateMark({ variant = "light", className }: GetBackplateMarkProps) {
  const leftFill = variant === "dark" ? "#ffffff" : "#162a3a";

  return (
    <svg
      viewBox="0 0 1011.8 242.5"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GetBackplate"
      role="img"
      className={className}
    >
      <path d="M967.2,29.5h32.9v183.5h-32.9v-3.7h15.6V33.2h-15.6v-3.7Z" fill="#d4531a" />
      <path d="M37,213H4.1V29.5h32.9v3.7h-15.6v176.1h15.6v3.7Z" fill={leftFill} />
    </svg>
  );
}
