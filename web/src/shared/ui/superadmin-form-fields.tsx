import type * as React from "react";

type CommonFieldProps = {
  label: string;
  className?: string;
  labelBgClassName?: string;
  fieldClassName?: string;
};

type InputFieldProps = CommonFieldProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

type SelectFieldProps = CommonFieldProps &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
    children: React.ReactNode;
  };

function join(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const baseFieldClass =
  "peer w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:font-medium placeholder:text-[var(--gbp-muted)] transition focus:border-[var(--gbp-accent)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)]";

const baseLabelClass =
  "absolute -top-2 left-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gbp-text2)] transition peer-focus:text-[var(--gbp-accent)]";

export function SuperadminInputField({
  label,
  className,
  labelBgClassName = "bg-[var(--gbp-surface)]",
  fieldClassName,
  ...props
}: InputFieldProps) {
  return (
    <label className={join("relative", className)}>
      <span className={join(baseLabelClass, labelBgClassName)}>{label}</span>
      <input {...props} className={join(baseFieldClass, fieldClassName)} />
    </label>
  );
}

export function SuperadminSelectField({
  label,
  className,
  labelBgClassName = "bg-[var(--gbp-surface)]",
  fieldClassName,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <label className={join("relative", className)}>
      <span className={join(baseLabelClass, labelBgClassName)}>{label}</span>
      <select {...props} className={join(baseFieldClass, fieldClassName)}>
        {children}
      </select>
    </label>
  );
}
