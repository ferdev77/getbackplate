'use client'

/**
 * GetBackplate — ThemeToggle Component
 * Day Shift (light) / Night Shift (dark) toggle.
 *
 * Logic:
 * - Auto: 06:00–18:00 = Day Shift (light), 18:00–06:00 = Night Shift (dark)
 * - Manual override stored in localStorage ('gbp-theme')
 * - Reads/writes `data-theme` attribute on <html>
 *
 * Usage:
 *   <ThemeToggle />                    // shows label + toggle
 *   <ThemeToggle showLabel={false} />  // toggle only
 */

'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  showLabel?: boolean
  className?: string
}

const DARK_START = 18
const DARK_END   = 6
const STORAGE_KEY = 'gbp-theme'

function isDarkHour(): boolean {
  const h = new Date().getHours()
  return h >= DARK_START || h < DARK_END
}

export function ThemeToggle({ showLabel = true, className }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const dark = stored ? stored === 'dark' : isDarkHour()
    setIsDark(dark)
    applyTheme(dark)
    setMounted(true)
  }, [])

  function applyTheme(dark: boolean) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }

  function toggle() {
    const next = !isDark
    setIsDark(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
  }

  if (!mounted) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showLabel && (
        <span
          className="text-xxs font-extrabold uppercase tracking-label text-gbp-muted"
          style={{ width: 72, textAlign: 'right', display: 'inline-block' }}
        >
          {isDark ? 'Night Shift' : 'Day Shift'}
        </span>
      )}
      <button
        onClick={toggle}
        title="Toggle Day/Night Shift"
        aria-label="Toggle theme"
        className={cn(
          'relative w-[46px] h-[26px] rounded-pill border transition-all duration-[220ms]',
          isDark
            ? 'bg-violet border-violet/40'
            : 'bg-gbp-surface2 border-gbp-border2',
        )}
      >
        <div
          className={cn(
            'absolute top-[3px] w-[18px] h-[18px] rounded-full',
            'flex items-center justify-center text-xs leading-none',
            'bg-white shadow-sm transition-transform duration-[220ms]',
            isDark ? 'translate-x-[22px]' : 'translate-x-[3px]',
          )}
        >
          {isDark ? '🌙' : '☀️'}
        </div>
      </button>
    </div>
  )
}
