/**
 * GetBackplate — tailwind.config.ts
 * Extends Tailwind with the full GBP design system.
 * All tokens match design-tokens.ts and globals.css exactly.
 */

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Enable class-based dark mode (controlled via data-theme attribute)
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {

      // ─── COLORS ────────────────────────────────────────────────────────
      colors: {
        // Brand
        accent:  {
          DEFAULT: '#D4531A',
          hover:   '#E06030',
          glow:    'rgba(212,83,26,0.13)',
          dark:    '#FF6B35',
        },
        violet: {
          DEFAULT: '#6C47FF',
          hover:   '#7B5CFF',
          soft:    'rgba(108,71,255,0.1)',
          dark:    '#8B6FFF',
        },

        // Semantic
        success: {
          DEFAULT: '#22C55E',
          soft:    'rgba(34,197,94,0.1)',
        },
        error: {
          DEFAULT: '#EF4444',
          soft:    'rgba(239,68,68,0.1)',
        },

        // Light mode surfaces
        'gbp-bg':      'var(--bg)',
        'gbp-bg2':     'var(--bg2)',
        'gbp-surface': 'var(--surface)',
        'gbp-surface2':'var(--surface2)',

        // Text
        'gbp-text':    'var(--text)',
        'gbp-text2':   'var(--text2)',
        'gbp-muted':   'var(--muted)',

        // Borders
        'gbp-border':  'var(--border)',
        'gbp-border2': 'var(--border2)',
      },

      // ─── TYPOGRAPHY ────────────────────────────────────────────────────
      fontFamily: {
        sans:    ["'Plus Jakarta Sans'", 'sans-serif'],
        display: ["'Plus Jakarta Sans'", 'sans-serif'],
      },
      fontWeight: {
        light:     '300',
        regular:   '400',
        medium:    '500',
        semibold:  '600',
        bold:      '700',
        extrabold: '800',
      },
      fontSize: {
        'xxs':  ['10px', { lineHeight: '1.4' }],
        'xs':   ['11px', { lineHeight: '1.4' }],
        'sm':   ['13px', { lineHeight: '1.6' }],
        'base': ['14px', { lineHeight: '1.6' }],
        'md':   ['15px', { lineHeight: '1.7' }],
        'lg':   ['16px', { lineHeight: '1.6' }],
        'xl':   ['17px', { lineHeight: '1.5' }],
        '2xl':  ['20px', { lineHeight: '1.3' }],
        '3xl':  ['22px', { lineHeight: '1.2' }],
        '4xl':  ['26px', { lineHeight: '1.15' }],
        '5xl':  ['32px', { lineHeight: '1.1' }],
        '6xl':  ['40px', { lineHeight: '1.05' }],
        '7xl':  ['52px', { lineHeight: '1.0' }],
        '8xl':  ['64px', { lineHeight: '0.95' }],
        '9xl':  ['72px', { lineHeight: '0.9' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
        tighter:  '-0.02em',
        tight:    '-0.01em',
        normal:   '0em',
        wide:     '0.04em',
        wider:    '0.08em',
        widest:   '0.12em',
        label:    '0.1em',
      },

      // ─── BORDER RADIUS ─────────────────────────────────────────────────
      borderRadius: {
        'sm':   '6px',
        DEFAULT:'8px',
        'md':   '10px',
        'lg':   '12px',
        'xl':   '14px',
        '2xl':  '16px',
        'pill': '9999px',
      },

      // ─── SPACING ───────────────────────────────────────────────────────
      spacing: {
        '4.5':  '18px',
        '13':   '52px',
        '15':   '60px',
        '18':   '72px',
        '22':   '88px',
        '26':   '104px',
        '30':   '120px',
      },

      // ─── SHADOWS ───────────────────────────────────────────────────────
      boxShadow: {
        'sm':     '0 1px 3px rgba(17,24,39,0.07), 0 4px 16px rgba(17,24,39,0.05)',
        'md':     '0 4px 12px rgba(17,24,39,0.08), 0 2px 6px rgba(17,24,39,0.05)',
        'lg':     '0 8px 32px rgba(17,24,39,0.10), 0 2px 8px rgba(17,24,39,0.06)',
        'xl':     '0 20px 60px rgba(17,24,39,0.12), 0 4px 16px rgba(17,24,39,0.06)',
        'accent': '0 4px 14px rgba(212, 83, 26, 0.25)',
        'violet': '0 4px 14px rgba(108, 71, 255, 0.25)',
      },

      // ─── BREAKPOINTS ───────────────────────────────────────────────────
      screens: {
        'sm':  '640px',
        'md':  '768px',
        'lg':  '1024px',
        'xl':  '1100px',
        '2xl': '1400px',
      },

      // ─── ANIMATIONS ────────────────────────────────────────────────────
      keyframes: {
        gradShift: {
          '0%':   { backgroundPosition: '0% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.5', transform: 'scale(0.8)' },
        },
        floatBob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        checkPop: {
          '0%':   { transform: 'scale(0)', opacity: '0' },
          '70%':  { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'grad-shift': 'gradShift 4s linear infinite',
        'grad-shift-slow': 'gradShift 6s linear infinite',
        'fade-up':    'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':    'fadeIn 0.3s ease both',
        'slide-down': 'slideDown 0.22s cubic-bezier(0.16,1,0.3,1)',
        'float':      'floatBob 3s ease-in-out infinite',
        'pulse-dot':  'pulse 2s ease-in-out infinite',
        'marquee':    'marquee 32s linear infinite',
        'check-pop':  'checkPop 0.4s cubic-bezier(0.16,1,0.3,1) both',
      },

      // ─── TRANSITIONS ───────────────────────────────────────────────────
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '150':  '150ms',
        '220':  '220ms',
        '350':  '350ms',
        '400':  '400ms',
      },
    },
  },
  plugins: [],
}

export default config
