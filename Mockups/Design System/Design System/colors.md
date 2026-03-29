# GetBackplate — Color Reference

## Brand Rules (critical)

| Color | Rule |
|-------|------|
| 🟠 Orange (`--accent`) | Operations, features, primary CTAs, pricing, platform elements |
| 🟣 Violet (`--violet`) | **AI features ONLY** — never use for non-AI content |
| 🟢 Green (`--success`) | Positive states, ✓ tags, completion indicators |
| 🔴 Red (`--error`) | Error states, × tags, warnings |

**The cardinal rule: Never mix orange and violet in the same paragraph or sentence.**
Each color signals a specific meaning. Violet appearing on a non-AI element breaks trust.

---

## Full Palette

### Brand Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--accent` | `#D4531A` | `#FF6B35` | Primary brand, CTAs, operations |
| `--accent-h` | `#E06030` | `#FF7D4A` | Hover state |
| `--accent-glow` | `rgba(212,83,26,0.13)` | same | Backgrounds, glows |
| `--violet` | `#6C47FF` | `#8B6FFF` | AI features only |
| `--violet-h` | `#7B5CFF` | `#9B82FF` | Violet hover state |
| `--violet-soft` | `rgba(108,71,255,0.1)` | same | AI backgrounds |

### Backgrounds

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | `#F7F8FC` | `#0D0F14` | Page background |
| `--bg2` | `#EDEEF5` | `#13161E` | Slightly elevated bg, stripes |
| `--surface` | `#FFFFFF` | `#1A1D27` | Cards, nav, modals |
| `--surface2` | `#F2F3F9` | `#21253A` | Inputs, hover states |

### Text

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--text` | `#111827` | `#EDF0FF` | Primary text, headlines |
| `--text2` | `#4B5563` | `#B0B8D0` | Secondary text, descriptions |
| `--muted` | `#9CA3AF` | `#737B96` | Placeholder, captions, disabled |

### Borders

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border` | `#E5E7F0` | `#252836` | Default dividers |
| `--border2` | `#D1D5E0` | `#343748` | Stronger borders, input borders |

### Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--success` | `#22C55E` | ✓ Completed, active, on-track |
| `--success-soft` | `rgba(34,197,94,0.1)` | Success backgrounds |
| `--error` | `#EF4444` | × Error, warning, danger |
| `--error-soft` | `rgba(239,68,68,0.1)` | Error backgrounds |

---

## Plan Color Coding

Used in pricing cards, mega menu, module badges:

| Plan | Color | Hex |
|------|-------|-----|
| Starter | Green | `#22C55E` / `rgba(34,197,94,0.1)` |
| Growth | Violet | `#6C47FF` / `rgba(108,71,255,0.1)` |
| Pro | Orange | `#D4531A` / `rgba(212,83,26,0.13)` |
| Enterprise | Neutral | `var(--text2)` / `var(--surface2)` |

---

## Gradient Reference

### Animated text gradients
```css
/* Orange — operations */
background: linear-gradient(90deg, #D4531A 0%, #FF8C42 50%, #D4531A 100%);
background-size: 200% auto;
animation: gradShift 4s linear infinite;

/* Violet — AI ONLY */
background: linear-gradient(90deg, #6C47FF 0%, #A78BFA 50%, #6C47FF 100%);
background-size: 200% auto;
animation: gradShift 5s linear infinite;
```

### Background gradients
```css
/* Hero/CTA gradient (violet → orange) */
background: linear-gradient(135deg, #6C47FF 0%, #9B82FF 50%, #D4531A 100%);

/* Tagline break */
background: linear-gradient(135deg, #6C47FF 0%, #9B82FF 50%, #D4531A 100%);

/* AI panel background */
background: linear-gradient(135deg, rgba(108,71,255,0.1), rgba(139,111,255,0.05));
```

---

## Opacity Usage Conventions

| Context | Opacity | Example |
|---------|---------|---------|
| Backgrounds/glows | 0.08–0.15 | `rgba(212,83,26,0.13)` |
| Soft backgrounds | 0.1 | `rgba(108,71,255,0.1)` |
| Borders on color | 0.2–0.25 | `rgba(108,71,255,0.2)` |
| Disabled states | 0.4–0.5 | any color at 50% |
| Shadows | see tokens | — |

---

## Dark Mode Implementation

Theme is set via `data-theme` attribute on `<html>`:
```js
document.documentElement.setAttribute('data-theme', 'dark')
```

Auto-detection logic:
```js
const h = new Date().getHours()
const isDark = h >= 18 || h < 6  // 6pm–6am = Night Shift
```

Manual override stored in `localStorage('gbp-theme')`.

CSS handles all color switching automatically via CSS variables — no JS color logic needed beyond the class toggle.
