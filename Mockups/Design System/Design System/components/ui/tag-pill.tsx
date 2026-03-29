'use client'

/**
 * GetBackplate — TagPill Component
 * Used as section eyebrow labels throughout the platform.
 *
 * Usage:
 *   <TagPill>Platform Modules</TagPill>
 *   <TagPill variant="violet">AI Intelligence</TagPill>
 *   <TagPill variant="accent">Pricing</TagPill>
 *   <TagPill size="sm">Growth Plan</TagPill>
 */

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type TagVariant = 'default' | 'violet' | 'accent' | 'success'
type TagSize    = 'sm' | 'md'

interface TagPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant
  size?:    TagSize
}

const variantStyles: Record<TagVariant, string> = {
  default: 'bg-gbp-surface2 border-gbp-border2 text-gbp-text2',
  violet:  'bg-violet/10 border-violet/20 text-violet',
  accent:  'bg-accent/[0.13] border-accent/20 text-accent',
  success: 'bg-success/10 border-success/20 text-success',
}

const sizeStyles: Record<TagSize, string> = {
  sm: 'text-[9px] px-2.5 py-0.5',
  md: 'text-xxs px-3.5 py-[5px]',
}

export function TagPill({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: TagPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        'rounded-pill border',
        'font-bold uppercase tracking-wider',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
