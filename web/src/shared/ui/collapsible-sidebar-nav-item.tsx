"use client";

import Link from "next/link";
import { type CSSProperties, type ComponentType, type ReactNode } from "react";

import { TooltipLabel } from "@/shared/ui/tooltip";

type BaseProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  className: string;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onClick?: () => void;
  rightSlot?: ReactNode;
  iconClassName?: string;
  labelClassName?: string;
  tooltipSide?: "top" | "right";
};

type LinkVariantProps = BaseProps & {
  kind?: "link";
  href: string;
  prefetch?: boolean;
};

type ButtonVariantProps = BaseProps & {
  kind: "button";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

type CollapsibleSidebarNavItemProps = LinkVariantProps | ButtonVariantProps;

export function CollapsibleSidebarNavItem(props: CollapsibleSidebarNavItemProps) {
  const {
    icon: Icon,
    label,
    collapsed,
    className,
    style,
    onMouseEnter,
    onClick,
    rightSlot,
    iconClassName,
    labelClassName,
    tooltipSide = "right",
  } = props;

  const content = (
    <>
      <Icon className={iconClassName ?? "h-4 w-4"} />
      {!collapsed ? <span className={labelClassName}>{label}</span> : null}
      {rightSlot}
      {collapsed ? <TooltipLabel label={label} side={tooltipSide} /> : null}
    </>
  );

  const composedClassName = `${className} ${collapsed ? "group/tooltip relative" : ""}`.trim();

  if (props.kind === "button") {
    return (
      <button
        type={props.type ?? "button"}
        disabled={props.disabled}
        className={composedClassName}
        style={style}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={props.href}
      prefetch={props.prefetch}
      className={composedClassName}
      style={style}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
