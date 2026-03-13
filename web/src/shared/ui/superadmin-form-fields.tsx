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
  "peer w-full rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm placeholder:font-medium placeholder:text-[#9a908a] transition focus:border-[#b63a2f] focus:outline-none focus:ring-2 focus:ring-[#f3c3bc]";

const baseLabelClass =
  "absolute -top-2 left-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f857f] transition peer-focus:text-[#b63a2f]";

export function SuperadminInputField({
  label,
  className,
  labelBgClassName = "bg-white",
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
  labelBgClassName = "bg-white",
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
