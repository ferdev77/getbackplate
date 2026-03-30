/**
 * GetBackplate Design Tokens
 * Use these constants throughout your Next.js app for consistency.
 * Import: import { colors, typography, spacing } from '@/lib/design-tokens'
 */

// ─── COLORS ───────────────────────────────────────────────────────────────────

export const colors = {
  // Brand
  accent:       '#D4531A',  // Orange — operations, CTAs, primary actions
  accentHover:  '#E06030',  // Orange hover state
  accentGlow:   'rgba(212,83,26,0.13)',

  // AI (violet — ONLY for AI-related features)
  violet:       '#6C47FF',
  violetHover:  '#7B5CFF',
  violetSoft:   'rgba(108,71,255,0.1)',

  // Semantic
  success:      '#22C55E',
  successSoft:  'rgba(34,197,94,0.1)',
  error:        '#EF4444',
  errorSoft:    'rgba(239,68,68,0.1)',
  warning:      '#F59E0B',

  // Light mode
  light: {
    bg:         '#F7F8FC',
    bg2:        '#EDEEF5',
    surface:    '#FFFFFF',
    surface2:   '#F2F3F9',
    text:       '#111827',
    text2:      '#4B5563',
    muted:      '#9CA3AF',
    border:     '#E5E7F0',
    border2:    '#D1D5E0',
  },

  // Dark mode
  dark: {
    bg:         '#0D0F14',
    bg2:        '#13161E',
    surface:    '#1A1D27',
    surface2:   '#21253A',
    text:       '#EDF0FF',
    text2:      '#B0B8D0',
    muted:      '#737B96',
    border:     '#252836',
    border2:    '#343748',
    // Dark mode accent variants
    accent:     '#FF6B35',
    accentHover:'#FF7D4A',
    violet:     '#8B6FFF',
    violetHover:'#9B82FF',
  },
} as const

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────

export const typography = {
  // Font families
  fontDisplay: "'Plus Jakarta Sans', sans-serif",  // Headlines, nav, numbers
  fontBody:    "'Plus Jakarta Sans', sans-serif",   // Body text

  // Font weights
  weight: {
    light:     300,
    regular:   400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },

  // Font sizes (px)
  size: {
    xs:   10,
    sm:   11,
    base: 13,
    md:   14,
    lg:   15,
    xl:   16,
    '2xl': 17,
    '3xl': 20,
    '4xl': 22,
    '5xl': 26,
    display: 'clamp(34px, 4vw, 52px)',
    hero:    'clamp(42px, 5.5vw, 72px)',
  },

  // Letter spacing
  tracking: {
    tight:  '-0.03em',
    normal: '0',
    wide:   '0.04em',
    wider:  '0.08em',
    widest: '0.12em',
    label:  '0.1em',    // Uppercase labels
  },

  // Line heights
  leading: {
    none:   1,
    tight:  1.1,
    snug:   1.3,
    normal: 1.6,
    relaxed:1.75,
    loose:  1.8,
  },
} as const

// ─── SPACING ──────────────────────────────────────────────────────────────────

export const spacing = {
  0:   '0px',
  1:   '4px',
  2:   '8px',
  3:   '12px',
  4:   '14px',
  5:   '16px',
  6:   '20px',
  7:   '24px',
  8:   '28px',
  9:   '32px',
  10:  '36px',
  11:  '40px',
  12:  '48px',
  14:  '56px',
  16:  '64px',
  20:  '80px',
  24:  '96px',  // Standard section padding
  28:  '112px',
} as const

// ─── BORDER RADIUS ────────────────────────────────────────────────────────────

export const radius = {
  none:  '0px',
  sm:    '6px',    // Small elements: badges, pills small
  md:    '8px',    // Buttons, inputs, small cards
  lg:    '10px',   // Default radius
  xl:    '12px',   // Cards, panels
  '2xl': '14px',   // Large cards, mock windows
  '3xl': '16px',   // Modals
  full:  '9999px', // Pills, tags, toggles
} as const

// ─── SHADOWS ──────────────────────────────────────────────────────────────────

export const shadows = {
  sm:  '0 1px 3px rgba(17,24,39,0.07), 0 4px 16px rgba(17,24,39,0.05)',
  md:  '0 4px 12px rgba(17,24,39,0.08), 0 2px 6px rgba(17,24,39,0.05)',
  lg:  '0 8px 32px rgba(17,24,39,0.1), 0 2px 8px rgba(17,24,39,0.06)',
  xl:  '0 20px 60px rgba(17,24,39,0.12), 0 4px 16px rgba(17,24,39,0.06)',
  // Dark mode variants
  dark: {
    sm:  '0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)',
    lg:  '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
    xl:  '0 20px 60px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
  },
  // Glow effects
  accentGlow: '0 4px 14px rgba(212,83,26,0.25)',
  violetGlow: '0 4px 14px rgba(108,71,255,0.25)',
} as const

// ─── TRANSITIONS ──────────────────────────────────────────────────────────────

export const transitions = {
  fast:    '0.15s ease',
  default: '0.22s ease',
  slow:    '0.35s ease',
  spring:  '0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  theme:   '0.4s ease',  // For dark/light mode switches
} as const

// ─── GRADIENTS ────────────────────────────────────────────────────────────────

export const gradients = {
  // Animated text gradients (use with background-clip: text)
  orange: 'linear-gradient(90deg, #D4531A 0%, #FF8C42 50%, #D4531A 100%)',
  violet: 'linear-gradient(90deg, #6C47FF 0%, #A78BFA 50%, #6C47FF 100%)',
  mixed:  'linear-gradient(90deg, #D4531A 0%, #FF8A50 30%, #6C47FF 70%, #D4531A 100%)',

  // Background gradients
  hero:   'linear-gradient(135deg, #6C47FF 0%, #9B82FF 50%, #D4531A 100%)',
  cta:    'linear-gradient(135deg, #6C47FF 0%, #D4531A 100%)',

  // Subtle backgrounds
  aiPanel: 'linear-gradient(135deg, rgba(108,71,255,0.1), rgba(139,111,255,0.05))',
} as const

// ─── BREAKPOINTS ──────────────────────────────────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1100px',
  '2xl': '1400px',
} as const

// ─── Z-INDEX ──────────────────────────────────────────────────────────────────

export const zIndex = {
  base:    0,
  raised:  10,
  dropdown: 50,
  sticky:  89,
  megamenu: 90,
  nav:     999,
  modal:   9000,
  toast:   9999,
} as const

// ─── ANIMATION KEYFRAMES (CSS-in-JS) ─────────────────────────────────────────

export const keyframes = {
  gradShift: {
    '0%':   { backgroundPosition: '0% center' },
    '100%': { backgroundPosition: '200% center' },
  },
  fadeUp: {
    from: { opacity: 0, transform: 'translateY(16px)' },
    to:   { opacity: 1, transform: 'translateY(0)' },
  },
  pulse: {
    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
    '50%':      { opacity: 0.5, transform: 'scale(0.8)' },
  },
  floatBob: {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%':      { transform: 'translateY(-6px)' },
  },
  megaDown: {
    from: { opacity: 0, transform: 'translateY(-6px)' },
    to:   { opacity: 1, transform: 'translateY(0)' },
  },
} as const
