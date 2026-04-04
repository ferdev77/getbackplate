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
      <path
        d="M37.01,212.99H4.09V29.54h32.92v3.66h-15.59v176.14h15.59v3.66Z"
        fill={leftFill}
        transform="translate(7 0) scale(0.26)"
      />
      <path
        d="M967.17,29.54h32.92v183.45h-32.92v-3.66h15.59V33.19h-15.59v-3.66Z"
        fill="#d4531a"
        transform="translate(-205.4 0) scale(0.26)"
      />
    </svg>
  );
}
