'use client'

/**
 * GetBackplate — Button Component
 * Three variants matching the landing page exactly.
 *
 * Usage:
 *   <Button>Request Your Seat →</Button>
 *   <Button variant="ghost">See the modules</Button>
 *   <Button variant="seat" onClick={openModal}>Request Your Seat →</Button>
 *   <Button variant="nav">Request Your Seat</Button>
 */

import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'ghost' | 'seat' | 'nav' | 'outline'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?:    ButtonSize
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  // Orange filled — primary CTA
  primary: [
    'bg-accent text-white font-extrabold',
    'hover:bg-accent-hover hover:-translate-y-0.5',
    'shadow-accent hover:shadow-accent',
    'transition-all duration-[220ms]',
  ].join(' '),

  // Transparent with border — secondary
  ghost: [
    'bg-transparent text-gbp-text2 font-semibold',
    'border border-gbp-border2',
    'hover:bg-gbp-surface2 hover:text-gbp-text',
    'transition-all duration-[220ms]',
  ].join(' '),

  // Seat request — maps to price-seat-btn in landing
  seat: [
    'bg-gbp-surface2 text-gbp-text2 font-bold',
    'border border-gbp-border2 w-full',
    'hover:bg-accent hover:text-white hover:border-accent',
    'transition-all duration-[220ms]',
  ].join(' '),

  // Nav CTA — small orange in navbar
  nav: [
    'bg-accent text-white font-bold',
    'hover:bg-accent-hover hover:-translate-y-0.5',
    'transition-all duration-[220ms]',
    'border-none',
  ].join(' '),

  // Outline violet — used for featured/AI elements
  outline: [
    'bg-transparent text-violet font-bold',
    'border border-violet/30',
    'hover:bg-violet/10',
    'transition-all duration-[220ms]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xxs px-3.5 py-2 rounded-sm',
  md: 'text-sm px-[18px] py-[10px] rounded',
  lg: 'text-md px-6 py-[13px] rounded-md',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2',
          'font-["Plus_Jakarta_Sans"]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children}
          </>
        ) : children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
export type { ButtonVariant, ButtonSize, ButtonProps }
