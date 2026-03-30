# GetBackplate Design System
## Master Reference Document
### Version 1.0 — March 2026

---

## Overview

The GetBackplate Design System is the single source of truth for all visual decisions across the GetBackplate product family. It was built from the ground up for the landing page at `getbackplate.com` and is designed to extend cleanly into the main platform built with **Next.js + Tailwind CSS + Supabase**.

---

## File Structure

```
gbp-design-system/
├── design-tokens.ts              ← TypeScript constants for all tokens
├── globals.css                   ← CSS variables, resets, base utilities
├── tailwind.config.ts            ← Tailwind extension with all tokens
├── typography.md                 ← Typography rules and scale
├── colors.md                     ← Color palette and usage rules
├── components/
│   └── ui/
│       ├── button.tsx            ← Button component (3 variants)
│       ├── theme-toggle.tsx      ← Day/Night Shift toggle
│       └── tag-pill.tsx          ← Section eyebrow pills
└── DESIGN-SYSTEM.md             ← This document
```

---

## 1. Brand Identity

### The Core Rule
GetBackplate uses **two accent colors** with strict semantic meaning:

| Color | Hex | Purpose |
|-------|-----|---------|
| 🟠 Orange | `#D4531A` | Operations, features, CTAs, everything product |
| 🟣 Violet | `#6C47FF` | **AI features ONLY** — never use for other content |

This is not a preference — it's a system. Orange = the platform. Violet = AI. These two colors should never appear together in the same sentence or paragraph. A visitor scanning the page should be able to tell at a glance which features are AI-powered (violet) vs. standard operations (orange).

### Tone
- **Direct.** No fluff. No filler. Every word earns its place.
- **Confident.** The product knows what it is. "We do." not "We might help."
- **Operator-first.** Built by people who've worked in restaurants.

---

## 2. Typography

**One font. Zero exceptions.**

`Plus Jakarta Sans` — weights 300–800.

### Hierarchy at a glance

```
Hero H1      72px / 800 / -0.03em / lh 0.95   → Landing hero only
Section H2   40px / 800 / -0.03em / lh 1.1    → All major sections
Card H3      22px / 800 / -0.02em / lh 1.2    → Cards, panels
Body Large   15px / 500 / 0 / lh 1.75         → Section subtitles
Body         14px / 400 / 0 / lh 1.6          → Descriptions, paragraphs
Label        11px / 700 / 0.1em / UPPERCASE   → Section tags, eyebrows
Badge        10px / 700 / 0.12em / UPPERCASE  → Tiny indicators
```

### Animated Gradient Text

Three classes for accent text in headlines:

```jsx
<span className="grad-orange">First</span>       // Orange — operations
<span className="grad-violet">never clocks out.</span>  // Violet — AI only
<span className="grad-mixed">together</span>     // Both — use sparingly
```

---

## 3. Colors

### Full Token Map

All colors live in `globals.css` as CSS variables and in `design-tokens.ts` as TypeScript constants. The system is fully dark/light aware — switching `data-theme="dark"` on `<html>` applies all dark variants automatically.

See `colors.md` for the complete reference.

### Key pairs

```css
/* Light / Dark pairs */
--bg:      #F7F8FC / #0D0F14    /* Page background */
--surface: #FFFFFF  / #1A1D27   /* Cards, nav */
--text:    #111827  / #EDF0FF   /* Primary text */
--accent:  #D4531A  / #FF6B35   /* Orange (brighter in dark) */
--violet:  #6C47FF  / #8B6FFF   /* Violet (brighter in dark) */
```

---

## 4. Day Shift / Night Shift (Theme)

The system auto-detects the correct theme by time of day:

| Hours | Mode | Label |
|-------|------|-------|
| 06:00 – 18:00 | Light | ☀️ Day Shift |
| 18:00 – 06:00 | Dark | 🌙 Night Shift |

Users can override manually. Override is stored in `localStorage('gbp-theme')`.

```tsx
// Use the component
import { ThemeToggle } from '@/components/ui/theme-toggle'
<ThemeToggle />                    // Label + toggle
<ThemeToggle showLabel={false} />  // Toggle only
```

The label ("Day Shift" / "Night Shift") always appears **before** the toggle pill, with a fixed width of 72px to prevent layout shift on change.

---

## 5. Spacing System

Base unit: 4px. Standard section padding: 96px vertical.

```
4px  / 8px  / 12px / 14px / 16px / 20px / 24px /
28px / 32px / 36px / 40px / 48px / 56px / 64px /
80px / 96px / 112px
```

Container max-width: `1400px` with `40px` horizontal padding (mobile: `20px`).

---

## 6. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, badges |
| Default | 8px | Buttons, inputs |
| `--radius` | 10–12px | Cards, panels |
| `--radius-lg` | 14–16px | Modals, large panels |
| Full | 9999px | Pills, tags, toggles |

---

## 7. Shadows

Shadows use very low opacity and work on both light and dark backgrounds:

```css
--shadow-sm: 0 1px 3px rgba(17,24,39,0.07), 0 4px 16px rgba(17,24,39,0.05);
--shadow-md: 0 4px 12px rgba(17,24,39,0.08), 0 2px 6px rgba(17,24,39,0.05);
--shadow-lg: 0 8px 32px rgba(17,24,39,0.10), 0 2px 8px rgba(17,24,39,0.06);
--shadow-xl: 0 20px 60px rgba(17,24,39,0.12), 0 4px 16px rgba(17,24,39,0.06);

/* Glow effects */
--shadow-accent: 0 4px 14px rgba(212, 83, 26, 0.25);
--shadow-violet: 0 4px 14px rgba(108, 71, 255, 0.25);
```

Dark mode uses separate variables with higher opacity (see `globals.css`).

---

## 8. Components

### Button

Five variants, three sizes. See `components/ui/button.tsx`.

| Variant | Appearance | Usage |
|---------|------------|-------|
| `primary` | Orange filled | Primary CTA, "Request Your Seat" |
| `ghost` | Transparent + border | Secondary actions |
| `seat` | Gray bg → orange on hover | Pricing card CTAs |
| `nav` | Orange small | Nav bar CTA |
| `outline` | Violet border | AI-related actions |

```tsx
<Button>Request Your Seat →</Button>
<Button variant="ghost">See the modules</Button>
<Button variant="seat" size="sm">Request Your Seat →</Button>
```

### TagPill

Section eyebrow labels. See `components/ui/tag-pill.tsx`.

| Variant | Color | Usage |
|---------|-------|-------|
| `default` | Gray | Most sections |
| `violet` | Violet | AI sections only |
| `accent` | Orange | Pricing, CTAs |
| `success` | Green | Positive indicators |

```tsx
<TagPill>Platform Modules</TagPill>
<TagPill variant="violet">AI Intelligence</TagPill>
<TagPill variant="sm">Growth Plan</TagPill>
```

### ThemeToggle

See `components/ui/theme-toggle.tsx`. Label always before toggle.

---

## 9. Animations

### Reveal on scroll
Elements start `opacity: 0, translateY(20px)` and transition to visible when entering the viewport. Stagger for grids (80ms delay per card).

```css
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Gradient text
200% background-size animated at 4–6s. See `globals.css` for the `gradShift` keyframe.

### Transitions
- Default: `0.22s ease`
- Spring: `0.3s cubic-bezier(0.16, 1, 0.3, 1)` — for menus, modals, dropdowns
- Theme: `0.4s ease` — for dark/light switches

---

## 10. Breakpoints

| Name | Value | Context |
|------|-------|---------|
| `sm` | 640px | — |
| `md` | 768px | Mobile → tablet |
| `lg` | 1024px | Tablet → desktop |
| `xl` | 1100px | Wide desktop |
| `2xl`| 1400px | Container max |

Mobile-first approach. Most layout changes happen at `md` (768px).

---

## 11. Plan Color Coding

When displaying plan names as badges or labels, always use the plan's assigned color:

```tsx
// Starter → green
<span className="bg-success/10 text-success">Starter</span>

// Growth → violet
<span className="bg-violet/10 text-violet">Growth</span>

// Pro → orange
<span className="bg-accent/10 text-accent">Pro</span>

// Enterprise → neutral
<span className="bg-gbp-surface2 text-gbp-text2">Enterprise</span>
```

---

## 12. Copy & Tone Guidelines

### Voice
- Short sentences. Direct declarations.
- Restaurant-native language: "shift", "location", "manager", "compliance"
- No jargon that a restaurant owner wouldn't say out loud

### Copy patterns used in the landing

| Pattern | Example |
|---------|---------|
| Bold problem → solution | "But who runs the rest? **We do.**" |
| Feature + benefit | "**Digital checklists** by shift — signed off and tracked" |
| Contrast statement | "Not a POS. The system that runs everything your POS ignores." |
| Authority | "We've worked every shift." |

### AI copy rules
- Always lead with the practical outcome, not the technology
- ✅ "Write one sentence. Get a publish-ready draft."
- ❌ "Uses advanced LLM technology to generate content"

---

## 13. Quick Setup for Next.js Project

```bash
# 1. Install dependencies
npm install next react react-dom typescript
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 2. Copy these files to your project
cp design-tokens.ts          src/lib/design-tokens.ts
cp globals.css               app/globals.css
cp tailwind.config.ts        tailwind.config.ts
cp components/ui/button.tsx  src/components/ui/button.tsx
cp components/ui/theme-toggle.tsx  src/components/ui/theme-toggle.tsx
cp components/ui/tag-pill.tsx      src/components/ui/tag-pill.tsx

# 3. Add font to layout.tsx
```

```tsx
// app/layout.tsx
import { Plus_Jakarta_Sans } from 'next/font/google'

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300','400','500','600','700','800'],
  variable: '--font-jakarta',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={font.variable}>{children}</body>
    </html>
  )
}
```

```tsx
// 4. Apply theme on mount
'use client'
import { useEffect } from 'react'

export function ThemeProvider({ children }) {
  useEffect(() => {
    const stored = localStorage.getItem('gbp-theme')
    const h = new Date().getHours()
    const dark = stored ? stored === 'dark' : (h >= 18 || h < 6)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [])
  return <>{children}</>
}
```

---

*GetBackplate Design System v1.0 — Built March 2026*
*Maintained by the GetBackplate product team*
